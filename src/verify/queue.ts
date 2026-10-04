import type {
  ActiveRead, LcuGame, LcuPlayer, LcuRead, LockedChallenge, PendingReason, RunQueue, RunStatus, VerificationData, VerifiedRun,
} from './types.ts';
import { AUGMENT_ITEM_EXCEPTIONS, MAYHEM_QUEUE_ID, evaluateGame } from './verifier.ts';

// The persistent queue of locked runs and how each one is matched to exactly one game.
// See docs/CHALLENGE_VERIFICATION.md ("Matching runs to games") before changing these rules.

const MAX_RESOLVED = 100;
const MAX_CLAIMED = 200;

export const runStatus = (run: LockedChallenge): RunStatus => run.resolution?.kind ?? 'pending';
export const isPending = (run: LockedChallenge) => !run.resolution;

/** Oldest lock first; ties by ID. Earlier runs always get the first claim on a game. */
export function lockOrder(runs: readonly LockedChallenge[]): LockedChallenge[] {
  return [...runs].sort((a, b) => a.lockedAt - b.lockedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** A pending run waiting for "the next Mayhem game" (not bound to a specific game). */
export function waitingForNextGame(queue: RunQueue): LockedChallenge | null {
  return lockOrder(queue.runs.filter(run => isPending(run) && run.activeGameId === undefined)).at(-1) ?? null;
}

/** Every game ID already used to resolve a run, or bound to one. */
function usedGameIds(queue: RunQueue, history: readonly VerifiedRun[]): Set<number> {
  return new Set([...history.map(run => run.gameId), ...queue.runs.flatMap(run => (run.resolution ? [run.resolution.gameId] : []))]);
}

/** What the native read needs: list games after the oldest unbound lock, and fetch bound games by ID. */
export function readRequest(queue: RunQueue): { since: number; gameIds: number[] } | null {
  const pending = queue.runs.filter(isPending);
  if (!pending.length) return null;
  const unbound = pending.filter(run => run.activeGameId === undefined).map(run => run.lockedAt);
  const gameIds = [...new Set(pending.flatMap(run => (run.activeGameId === undefined ? [] : [run.activeGameId])))];
  return { since: unbound.length ? Math.min(...unbound) : Math.max(...pending.map(run => run.lockedAt)), gameIds };
}

const readReasons: Record<Exclude<LcuRead['status'], 'ok'>, PendingReason> = {
  clientNotRunning: 'CLIENT_NOT_RUNNING', notSignedIn: 'NOT_SIGNED_IN', unavailable: 'LCU_UNAVAILABLE', desktopOnly: 'DESKTOP_ONLY',
};

export interface QueueResult {
  readonly queue: RunQueue;
  readonly history: readonly VerifiedRun[];
  /** Runs resolved by this pass, in lock order. */
  readonly resolved: readonly LockedChallenge[];
  /** Why each still-pending run is pending. */
  readonly waiting: Readonly<Record<string, PendingReason>>;
}

/**
 * Matches pending runs to published games, oldest lock first. Each game resolves at most one run,
 * ever. A bound run is resolved only by its bound game. An unbound run is resolved by the first
 * Mayhem game created after its lock that no earlier run took and no pending run is bound to:
 * the next opportunity, never a later one picked by the player. Other modes are ignored. A game
 * not yet published leaves the run pending, with no time limit.
 */
export function resolveQueue(
  queue: RunQueue, history: readonly VerifiedRun[], read: LcuRead, data: VerificationData, now: number,
  exceptions: Readonly<Record<number, readonly string[]>> = AUGMENT_ITEM_EXCEPTIONS,
): QueueResult {
  const pending = lockOrder(queue.runs.filter(isPending));
  if (read.status !== 'ok') {
    return { queue, history, resolved: [], waiting: Object.fromEntries(pending.map(run => [run.id, readReasons[read.status]])) };
  }
  const used = usedGameIds(queue, history);
  const reserved = new Set(pending.flatMap(run => (run.activeGameId === undefined ? [] : [run.activeGameId])));
  const mayhem = read.games.filter(game => game.queueId === MAYHEM_QUEUE_ID)
    .sort((a, b) => a.gameCreation - b.gameCreation || a.gameId - b.gameId);
  const updates = new Map<string, LockedChallenge>();
  const waiting: Record<string, PendingReason> = {};
  let nextHistory = history;

  for (const run of pending) {
    const candidate = run.activeGameId !== undefined
      ? mayhem.find(game => game.gameId === run.activeGameId)
      : mayhem.find(game => game.gameCreation > run.lockedAt && !used.has(game.gameId) && !reserved.has(game.gameId));
    if (!candidate) { waiting[run.id] = 'WAITING_FOR_HISTORY'; continue; }
    if (used.has(candidate.gameId)) {
      // Only reachable for a bound game already counted elsewhere: it can never count twice.
      updates.set(run.id, { ...run, resolution: {
        kind: 'cancelled', gameId: candidate.gameId, gameCreation: candidate.gameCreation, resolvedAt: now,
        reason: 'GAME_ALREADY_COUNTED', championMatch: false, spellsMatch: false,
      } });
      continue;
    }
    used.add(candidate.gameId); // Taken for this pass even when unreadable, so later runs can't skip ahead onto it.
    if (!candidate.player) { waiting[run.id] = 'INCOMPLETE_DATA'; continue; }
    const { resolution, verified } = evaluateGame(run, candidate as LcuGame & { player: LcuPlayer }, data, now, exceptions);
    updates.set(run.id, { ...run, resolution });
    if (verified) nextHistory = [...nextHistory, verified];
  }

  if (!updates.size) return { queue, history, resolved: [], waiting };
  const runs = queue.runs.map(run => updates.get(run.id) ?? run);
  return {
    queue: pruneQueue({ ...queue, runs }),
    history: nextHistory,
    resolved: lockOrder([...updates.values()]),
    waiting,
  };
}

/**
 * Adds a freshly locked run. `replaceId` may only remove a pending run waiting for the next
 * game (the one a new lock would otherwise queue behind); bound and resolved runs are never removed.
 */
export function addRun(queue: RunQueue, run: LockedChallenge, replaceId?: string): RunQueue {
  const runs = queue.runs.filter(entry => !(entry.id === replaceId && isPending(entry) && entry.activeGameId === undefined));
  return pruneQueue({ ...queue, runs: [...runs, run] });
}

/**
 * Binds a just-locked run to the game the client reported in progress after LOCK IT IN.
 * Binds only when: the run is still pending and unbound; it was bindable at lock time (no run
 * was already waiting for the next game, so this game can't be another run's next opportunity);
 * no older unbound run is pending; the game is Mayhem; and the game was never claimed, counted or
 * used. Any observed active Mayhem game is recorded as claimed either way, so replacing or
 * re-locking during the same match can never bind it again.
 */
export function bindRun(queue: RunQueue, history: readonly VerifiedRun[], runId: string, active: ActiveRead, bindable: boolean): RunQueue {
  if (active.status !== 'ok' || !active.active || active.active.queueId !== MAYHEM_QUEUE_ID) return queue;
  const { gameId } = active.active;
  const taken = queue.claimedGameIds.includes(gameId) || usedGameIds(queue, history).has(gameId)
    || queue.runs.some(run => run.activeGameId === gameId);
  const claimed = { ...queue, claimedGameIds: [...queue.claimedGameIds.filter(id => id !== gameId), gameId].slice(-MAX_CLAIMED) };
  const run = queue.runs.find(entry => entry.id === runId);
  if (!run || !isPending(run) || run.activeGameId !== undefined || !bindable || taken) return claimed;
  const olderWaiting = queue.runs.some(entry => entry.id !== runId && isPending(entry) && entry.activeGameId === undefined && entry.lockedAt <= run.lockedAt);
  if (olderWaiting) return claimed;
  return { ...claimed, runs: queue.runs.map(entry => (entry.id === runId ? { ...entry, activeGameId: gameId } : entry)) };
}

/** Pending runs are always kept; only the newest resolved runs are, since verified ones live in history. */
export function pruneQueue(queue: RunQueue): RunQueue {
  const resolved = queue.runs.filter(run => run.resolution)
    .sort((a, b) => b.resolution!.resolvedAt - a.resolution!.resolvedAt).slice(0, MAX_RESOLVED);
  const keep = new Set(resolved.map(run => run.id));
  return { ...queue, runs: queue.runs.filter(run => isPending(run) || keep.has(run.id)) };
}

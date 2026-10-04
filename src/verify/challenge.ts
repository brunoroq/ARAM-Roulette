import type { Draft } from '../types/game.ts';
import type { CancelReason, LockedChallenge, Resolution, RunQueue, UnverifiableReason, VerificationData, VerifiedRun } from './types.ts';
import { pruneQueue } from './queue.ts';

// The run queue and the verified-run history, both in localStorage beside the session (which
// Return Home clears; these are never cleared by the app). Stored by ID; names and icons come
// from the bundled catalog.
/** { schema: 1, runs: LockedChallenge[], claimedGameIds: number[] } */
export const queueStorageKey = 'aram-roulette.queue.v1';
/** v0.1.4's single challenge. A pending one is migrated into the queue, then the key is removed. */
export const legacyChallengeStorageKey = 'aram-roulette.challenge.v1';
/** { schema: 1, runs: VerifiedRun[] }. Unchanged since v0.1.4. */
export const historyStorageKey = 'aram-roulette.history.v1';
const QUEUE_SCHEMA = 1;
const HISTORY_SCHEMA = 1;
const MAX_RUNS = 500;

function localId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
}

/** Freezes the finalized draft as it was at LOCK IT IN, including the final D/F assignment. */
export function createChallenge(draft: Draft, data: VerificationData, lockedAt: number, id: string = localId()): LockedChallenge {
  const championKey = data.champions[draft.champion.id];
  const spellD = data.spells[draft.spells[draft.spellKeys.indexOf('D')]!.id];
  const spellF = data.spells[draft.spells[draft.spellKeys.indexOf('F')]!.id];
  if (draft.status !== 'finalized' || draft.buildSlots.length !== 6 || championKey === undefined || spellD === undefined || spellF === undefined) {
    throw new Error('Only a finalized six-item build can be locked as a challenge.');
  }
  return { schema: 2, id, lockedAt, championId: draft.champion.id, championKey, spellD, spellF, itemIds: draft.buildSlots.map(slot => slot.item.id) };
}

/** True when the run was locked from this exact build. */
export function challengeMatchesDraft(challenge: LockedChallenge, draft: Draft, data: VerificationData): boolean {
  const spellD = data.spells[draft.spells[draft.spellKeys.indexOf('D')]!.id];
  const spellF = data.spells[draft.spells[draft.spellKeys.indexOf('F')]!.id];
  return challenge.championId === draft.champion.id && challenge.spellD === spellD && challenge.spellF === spellF
    && challenge.itemIds.join() === draft.buildSlots.map(slot => slot.item.id).join();
}

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isGameId = (value: unknown): value is number => isInteger(value) && value > 0;
const isItemId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,7}$/.test(value);
const cancelReasons: readonly CancelReason[] = ['CHAMPION_MISMATCH', 'SPELL_MISMATCH', 'GAME_ALREADY_COUNTED'];
const unverifiableReasons: readonly UnverifiableReason[] = ['BUILD_MISMATCH', 'UNSUPPORTED_ITEM'];

function parseResolution(value: unknown): Resolution | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (!isGameId(r.gameId) || !isInteger(r.gameCreation) || !isInteger(r.resolvedAt)) return null;
  const base = { gameId: r.gameId, gameCreation: r.gameCreation, resolvedAt: r.resolvedAt };
  if (r.kind === 'verified') return { ...base, kind: 'verified' };
  if (r.kind === 'unverifiable' && unverifiableReasons.includes(r.reason as UnverifiableReason)) return { ...base, kind: 'unverifiable', reason: r.reason as UnverifiableReason };
  if (r.kind === 'cancelled' && cancelReasons.includes(r.reason as CancelReason) && typeof r.championMatch === 'boolean' && typeof r.spellsMatch === 'boolean') {
    return { ...base, kind: 'cancelled', reason: r.reason as CancelReason, championMatch: r.championMatch, spellsMatch: r.spellsMatch };
  }
  return null;
}

/** The fields every locked run shares, validated; null when anything is off. */
function parseLockedFields(saved: Record<string, unknown>) {
  if (typeof saved.id !== 'string' || !saved.id || !isInteger(saved.lockedAt) || saved.lockedAt <= 0 || typeof saved.championId !== 'string' || !saved.championId) return null;
  if (![saved.championKey, saved.spellD, saved.spellF].every(isInteger) || saved.spellD === saved.spellF) return null;
  const itemIds = saved.itemIds;
  if (!Array.isArray(itemIds) || itemIds.length !== 6 || !itemIds.every(isItemId) || new Set(itemIds).size !== 6) return null;
  return {
    schema: 2 as const, id: saved.id, lockedAt: saved.lockedAt, championId: saved.championId, championKey: saved.championKey as number,
    spellD: saved.spellD as number, spellF: saved.spellF as number, itemIds: [...itemIds] as string[],
  };
}

function parseRunEntry(value: unknown): LockedChallenge | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Record<string, unknown>;
  if (saved.schema !== 2) return null;
  const fields = parseLockedFields(saved);
  if (!fields) return null;
  if (saved.activeGameId !== undefined && !isGameId(saved.activeGameId)) return null;
  const resolution = saved.resolution === undefined ? undefined : parseResolution(saved.resolution);
  if (resolution === null) return null;
  // A bound run can only ever be resolved by its own game.
  if (resolution && saved.activeGameId !== undefined && resolution.gameId !== saved.activeGameId) return null;
  return { ...fields, ...(saved.activeGameId !== undefined ? { activeGameId: saved.activeGameId as number } : {}), ...(resolution ? { resolution } : {}) };
}

export const emptyQueue: RunQueue = { runs: [], claimedGameIds: [] };

/**
 * Invalid records are dropped individually. Run IDs are unique, a game resolves at most one run,
 * and a game is bound to at most one run (the first record wins).
 */
export function parseQueue(raw: string | null): RunQueue {
  if (!raw) return emptyQueue;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || saved.schema !== QUEUE_SCHEMA || !Array.isArray(saved.runs)) return emptyQueue;
    const runs: LockedChallenge[] = [];
    for (const entry of saved.runs) {
      const run = parseRunEntry(entry);
      if (!run || runs.some(existing => existing.id === run.id
        || (run.resolution && existing.resolution?.gameId === run.resolution.gameId)
        || (run.activeGameId !== undefined && existing.activeGameId === run.activeGameId))) continue;
      runs.push(run);
    }
    const claimedGameIds = Array.isArray(saved.claimedGameIds) ? [...new Set(saved.claimedGameIds.filter(isGameId) as number[])] : [];
    return pruneQueue({ runs, claimedGameIds });
  } catch { return emptyQueue; }
}

export function serializeQueue(queue: RunQueue): string {
  return JSON.stringify({ schema: QUEUE_SCHEMA, ...queue });
}

/**
 * v0.1.4 stored one challenge. Only a pending one carries anything to keep: it becomes an unbound
 * run (it was locked before its game, the only case v0.1.4 allowed). A verified one already lives
 * in history; an unverifiable one counted for nothing and its old reasons don't map onto the queue.
 */
export function migrateLegacyChallenge(raw: string | null): LockedChallenge | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || saved.schema !== 1 || saved.status !== 'pending') return null;
    return parseLockedFields(saved);
  } catch { return null; }
}

const isSpellPair = (value: unknown): value is [number, number] => Array.isArray(value) && value.length === 2 && value.every(isInteger);

/** Every field is required: a run missing data is dropped, never filled in. */
function parseRun(value: unknown): VerifiedRun | null {
  if (!value || typeof value !== 'object') return null;
  const run = value as Record<string, unknown>;
  const { lockedSpellIds, actualSpellIds, challengeItemIds, finalItemIds, completedItemIds } = run;
  if (typeof run.challengeId !== 'string' || !run.challengeId || typeof run.championId !== 'string' || !run.championId) return null;
  if (![run.lockedAt, run.gameId, run.gameCreation, run.verifiedAt, run.championKey].every(isInteger)) return null;
  if (!isSpellPair(lockedSpellIds) || !isSpellPair(actualSpellIds)) return null;
  if (!Array.isArray(challengeItemIds) || challengeItemIds.length !== 6 || !challengeItemIds.every(isItemId)) return null;
  if (!Array.isArray(finalItemIds) || finalItemIds.length !== 6 || !finalItemIds.every(isInteger)) return null;
  if (!Array.isArray(completedItemIds) || new Set(completedItemIds).size !== completedItemIds.length
    || !completedItemIds.every(id => challengeItemIds.includes(id))) return null;
  if (typeof run.win !== 'boolean') return null;
  return {
    challengeId: run.challengeId, lockedAt: run.lockedAt as number, gameId: run.gameId as number, gameCreation: run.gameCreation as number,
    verifiedAt: run.verifiedAt as number, championId: run.championId, championKey: run.championKey as number,
    lockedSpellIds: [lockedSpellIds[0], lockedSpellIds[1]], actualSpellIds: [actualSpellIds[0], actualSpellIds[1]],
    challengeItemIds: [...challengeItemIds], finalItemIds: [...finalItemIds], completedItemIds: [...completedItemIds], win: run.win,
  };
}

/** Invalid records are dropped individually; a game ID is only ever kept once (the first record wins). */
export function parseHistory(raw: string | null): VerifiedRun[] {
  if (!raw) return [];
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || saved.schema !== HISTORY_SCHEMA || !Array.isArray(saved.runs)) return [];
    const runs: VerifiedRun[] = [];
    for (const entry of saved.runs) {
      const run = parseRun(entry);
      if (run && !runs.some(existing => existing.gameId === run.gameId)) runs.push(run);
    }
    return runs.slice(-MAX_RUNS);
  } catch { return []; }
}

export function serializeHistory(runs: readonly VerifiedRun[]): string {
  return JSON.stringify({ schema: HISTORY_SCHEMA, runs });
}

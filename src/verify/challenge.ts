import type { Draft } from '../types/game.ts';
import type { BuildStatus, LockedChallenge, Outcome, UnverifiableReason, UnverifiableResult, VerificationData, VerifiedRun } from './types.ts';

// One locked challenge plus the verified-run history, both in localStorage beside the
// session (which Return Home clears; these are never cleared by the app). Stored by ID;
// names and icons come from the bundled catalog.
export const challengeStorageKey = 'aram-roulette.challenge.v1';
/** { schema: 1, runs: VerifiedRun[] }. Replaces the unreleased bare-array runs.v1 format. */
export const historyStorageKey = 'aram-roulette.history.v1';
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
  return {
    schema: 1, id, lockedAt, championId: draft.champion.id, championKey, spellD, spellF,
    itemIds: draft.buildSlots.map(slot => slot.item.id), status: 'pending',
  };
}

/** True when the challenge was locked from this exact build. */
export function challengeMatchesDraft(challenge: LockedChallenge, draft: Draft, data: VerificationData): boolean {
  const spellD = data.spells[draft.spells[draft.spellKeys.indexOf('D')]!.id];
  const spellF = data.spells[draft.spells[draft.spellKeys.indexOf('F')]!.id];
  return challenge.championId === draft.champion.id && challenge.spellD === spellD && challenge.spellF === spellF
    && challenge.itemIds.join() === draft.buildSlots.map(slot => slot.item.id).join();
}

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isItemId = (value: unknown): value is string => typeof value === 'string' && /^\d{1,7}$/.test(value);
const reasons: readonly UnverifiableReason[] = ['SPELL_MISMATCH', 'BUILD_MISMATCH', 'UNSUPPORTED_ITEM'];
const builds: readonly BuildStatus[] = ['compatible', 'mismatch', 'unsupported'];

function parseUnverifiable(value: unknown): UnverifiableResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (!isInteger(result.gameId) || !reasons.includes(result.reason as UnverifiableReason) || typeof result.spellsMatch !== 'boolean'
    || !builds.includes(result.build as BuildStatus) || !isInteger(result.completed) || result.completed < 0 || result.completed > 6) return null;
  return { gameId: result.gameId, reason: result.reason as UnverifiableReason, spellsMatch: result.spellsMatch, build: result.build as BuildStatus, completed: result.completed };
}

/** Invalid or unknown-schema data is discarded rather than trusted. */
export function parseChallenge(raw: string | null): LockedChallenge | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || saved.schema !== 1 || typeof saved.id !== 'string' || !saved.id) return null;
    if (!isInteger(saved.lockedAt) || saved.lockedAt <= 0 || typeof saved.championId !== 'string') return null;
    if (![saved.championKey, saved.spellD, saved.spellF].every(isInteger) || saved.spellD === saved.spellF) return null;
    if (!Array.isArray(saved.itemIds) || saved.itemIds.length !== 6 || !saved.itemIds.every(isItemId) || new Set(saved.itemIds).size !== 6) return null;
    if (!['pending', 'verified', 'unverifiable'].includes(saved.status)) return null;
    const unverifiable = saved.status === 'unverifiable' ? parseUnverifiable(saved.unverifiable) : null;
    if (saved.status === 'unverifiable' && !unverifiable) return null;
    return {
      schema: 1, id: saved.id, lockedAt: saved.lockedAt, championId: saved.championId, championKey: saved.championKey,
      spellD: saved.spellD, spellF: saved.spellF, itemIds: [...saved.itemIds], status: saved.status, ...(unverifiable ? { unverifiable } : {}),
    };
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

/** Pending outcomes leave everything unchanged; a game already in the history is never added again. */
export function applyOutcome(challenge: LockedChallenge, runs: readonly VerifiedRun[], outcome: Outcome): { challenge: LockedChallenge; runs: readonly VerifiedRun[] } {
  if (outcome.kind === 'pending' || challenge.status === 'verified') return { challenge, runs };
  if (outcome.kind === 'unverifiable') return { challenge: { ...challenge, status: 'unverifiable', unverifiable: outcome.result }, runs };
  const { unverifiable: _previous, ...rest } = challenge;
  const verified: LockedChallenge = { ...rest, status: 'verified' };
  if (runs.some(run => run.gameId === outcome.run.gameId)) return { challenge: verified, runs };
  return { challenge: verified, runs: [...runs, outcome.run].slice(-MAX_RUNS) };
}

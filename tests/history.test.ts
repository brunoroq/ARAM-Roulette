import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOutcome, parseHistory, serializeHistory } from '../src/verify/challenge.ts';
import { chronological, runStats } from '../src/verify/stats.ts';
import type { LockedChallenge, VerifiedRun } from '../src/verify/types.ts';

const ITEMS = ['6696', '3158', '3146', '3091', '6655', '126697'];
function run(gameId: number, gameCreation: number, win: boolean, overrides: Partial<VerifiedRun> = {}): VerifiedRun {
  return {
    challengeId: `c${gameId}`, lockedAt: gameCreation - 1000, gameId, gameCreation, verifiedAt: gameCreation + 2_000_000,
    championId: 'Lucian', championKey: 236, lockedSpellIds: [32, 1], actualSpellIds: [1, 32],
    challengeItemIds: ITEMS, finalItemIds: [6696, 3158, 3146, 3091, 0, 0], completedItemIds: ITEMS.slice(0, 4), win, ...overrides,
  };
}
/** Builds runs from a W/L string, in game order, one minute apart. */
const sequence = (pattern: string) => [...pattern].map((result, index) => run(index + 1, 1_000_000 + index * 60_000, result === 'W'));

test('history: a verified run round-trips with every field', () => {
  const runs = [run(1, 100, true)];
  const stored = serializeHistory(runs);
  assert.deepEqual(JSON.parse(stored), { schema: 1, runs });
  assert.deepEqual(parseHistory(stored), runs);
});

test('history: duplicate game IDs are ignored and the first record wins', () => {
  const first = run(1, 100, true);
  const parsed = parseHistory(serializeHistory([first, { ...first, win: false, challengeId: 'other' }, run(2, 200, false)]));
  assert.deepEqual(parsed.map(entry => [entry.gameId, entry.win]), [[1, true], [2, false]]);
});

test('history: malformed storage fails safely and only invalid records are dropped', () => {
  for (const raw of [null, '', '{', 'null', '[]', '42', JSON.stringify({ schema: 2, runs: [run(1, 1, true)] }), JSON.stringify({ schema: 1 }),
    JSON.stringify([run(1, 1, true)])]) {
    assert.deepEqual(parseHistory(raw), [], String(raw));
  }
  const good = run(3, 300, true);
  const { lockedSpellIds: _missing, ...noLockedSpells } = run(4, 400, true);
  const bad = [null, 'x', noLockedSpells, { ...run(5, 500, true), finalItemIds: [1] }, { ...run(6, 600, true), completedItemIds: ['9999'] },
    { ...run(7, 700, true), win: 'yes' }, { ...run(8, 800, true), championId: '' }, { ...run(9, 900, true), completedItemIds: ['6696', '6696'] }];
  assert.deepEqual(parseHistory(JSON.stringify({ schema: 1, runs: [...bad, good] })), [good]);
});

test('history: a new verification never duplicates a game already stored', () => {
  const challenge: LockedChallenge = {
    schema: 1, id: 'c9', lockedAt: 1, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, status: 'pending',
  };
  const existing = [run(9, 100, true)];
  const next = applyOutcome(challenge, existing, { kind: 'verified', run: run(9, 100, false) });
  assert.equal(next.challenge.status, 'verified');
  assert.equal(next.runs, existing);
});

test('stats: zero runs', () => {
  assert.deepEqual(runStats([]), { runs: 0, wins: 0, losses: 0, winRate: null, currentStreak: 0, bestStreak: 0 });
});

test('stats: one victory and one defeat', () => {
  assert.deepEqual(runStats(sequence('W')), { runs: 1, wins: 1, losses: 0, winRate: 1, currentStreak: 1, bestStreak: 1 });
  assert.deepEqual(runStats(sequence('L')), { runs: 1, wins: 0, losses: 1, winRate: 0, currentStreak: 0, bestStreak: 0 });
});

test('stats: counts and win rate', () => {
  const stats = runStats(sequence('WLWWL'));
  assert.equal(stats.runs, 5);
  assert.equal(stats.wins, 3);
  assert.equal(stats.losses, 2);
  assert.equal(stats.winRate, 0.6);
});

test('stats: W W L W → current 1, best 2', () => {
  const stats = runStats(sequence('WWLW'));
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.bestStreak, 2);
});

test('stats: L W W W → current 3, best 3', () => {
  const stats = runStats(sequence('LWWW'));
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.bestStreak, 3);
});

test('stats: a verified defeat ends the current streak', () => {
  assert.deepEqual([runStats(sequence('WWWL')).currentStreak, runStats(sequence('WWWL')).bestStreak], [0, 3]);
});

test('stats: ordering uses game creation, not insertion or verification order', () => {
  // Inserted as L, W, W but played W, W, L → no current streak.
  const runs = [run(3, 3000, false, { verifiedAt: 1 }), run(1, 1000, true, { verifiedAt: 99 }), run(2, 2000, true, { verifiedAt: 50 })];
  assert.deepEqual(chronological(runs).map(entry => entry.gameId), [1, 2, 3]);
  assert.equal(runStats(runs).currentStreak, 0);
  assert.equal(runStats(runs).bestStreak, 2);
  // Played L, W, W → current streak of two.
  const reordered = [run(1, 3000, true), run(2, 1000, false), run(3, 2000, true)];
  assert.equal(runStats(reordered).currentStreak, 2);
});

test('stats: identical creation times are ordered by game ID', () => {
  const runs = [run(20, 5000, false), run(10, 5000, true)];
  assert.deepEqual(chronological(runs).map(entry => entry.gameId), [10, 20]);
  assert.equal(runStats(runs).currentStreak, 0);
  assert.deepEqual(chronological([...runs].reverse()).map(entry => entry.gameId), [10, 20]);
});

test('stats: unverifiable attempts never change stats', () => {
  const challenge: LockedChallenge = {
    schema: 1, id: 'cX', lockedAt: 1, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, status: 'pending',
  };
  const runs = sequence('WW');
  const before = runStats(runs);
  const after = applyOutcome(challenge, runs, {
    kind: 'unverifiable', result: { gameId: 77, reason: 'UNSUPPORTED_ITEM', spellsMatch: true, build: 'unsupported', completed: 0 },
  });
  assert.equal(after.runs, runs);
  assert.deepEqual(runStats(after.runs), before);
  assert.equal(after.challenge.status, 'unverifiable');
});

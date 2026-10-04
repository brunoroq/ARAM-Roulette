import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrateLegacyChallenge, parseQueue, serializeQueue } from '../src/verify/challenge.ts';
import { addRun, bindRun, readRequest, resolveQueue, runStatus, waitingForNextGame } from '../src/verify/queue.ts';
import { runStats } from '../src/verify/stats.ts';
import type { ActiveRead, LcuGame, LcuPlayer, LcuRead, LockedChallenge, RunQueue, VerifiedRun } from '../src/verify/types.ts';

const data = JSON.parse(readFileSync(new URL('../src/data/verification.json', import.meta.url), 'utf8'));
const ITEMS = ['6696', '3158', '3146', '3091', '6655', '126697'];
const NOW = 9_000_000;

function run(id: string, lockedAt: number, overrides: Partial<LockedChallenge> = {}): LockedChallenge {
  return { schema: 2, id, lockedAt, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, ...overrides };
}
function player(overrides: Partial<LcuPlayer> = {}): LcuPlayer {
  return { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: [6696, 3146, 3158, 3091, 1036, 0, 2052], augments: [], ...overrides };
}
function mayhem(gameId: number, gameCreation: number, overrides: Partial<LcuPlayer> = {}): LcuGame {
  return { gameId, gameCreation, queueId: 2400, mapId: 12, gameMode: 'KIWI', player: player(overrides) };
}
function arena(gameId: number, gameCreation: number): LcuGame {
  return { gameId, gameCreation, queueId: 1750, mapId: 30, gameMode: 'CHERRY', player: null };
}
const ok = (...games: LcuGame[]): LcuRead => ({ status: 'ok', games });
const queueOf = (...runs: LockedChallenge[]): RunQueue => ({ runs, claimedGameIds: [] });
const resolve = (queue: RunQueue, read: LcuRead, history: readonly VerifiedRun[] = []) => resolveQueue(queue, history, read, data, NOW);
const statusOf = (queue: RunQueue, id: string) => runStatus(queue.runs.find(entry => entry.id === id)!);
const active = (gameId: number, queueId = 2400): ActiveRead => ({ status: 'ok', active: { gameId, queueId } });

test('1. lock before the match → next matching Mayhem verifies', () => {
  const result = resolve(queueOf(run('a', 1000)), ok(mayhem(5, 2000)));
  assert.equal(statusOf(result.queue, 'a'), 'verified');
  assert.deepEqual(result.history.map(entry => [entry.challengeId, entry.gameId, entry.completedItemIds.length]), [['a', 5, 4]]);
  assert.deepEqual(result.resolved.map(entry => entry.id), ['a']);
});

test('2–3. the next Mayhem with another champion or spell pair cancels the run, and later games are not scanned', () => {
  const champion = resolve(queueOf(run('a', 1000)), ok(mayhem(5, 2000, { championId: 99 }), mayhem(6, 3000)));
  assert.equal(statusOf(champion.queue, 'a'), 'cancelled');
  assert.deepEqual(champion.queue.runs[0]!.resolution, {
    kind: 'cancelled', gameId: 5, gameCreation: 2000, resolvedAt: NOW, reason: 'CHAMPION_MISMATCH', championMatch: false, spellsMatch: true,
  });
  assert.deepEqual(champion.history, []); // The matching game 6 never rescues it.
  const spells = resolve(queueOf(run('a', 1000)), ok(mayhem(5, 2000, { spell1Id: 4 }), mayhem(6, 3000)));
  assert.equal(statusOf(spells.queue, 'a'), 'cancelled');
  assert.equal(spells.queue.runs[0]!.resolution?.kind === 'cancelled' && spells.queue.runs[0]!.resolution.reason, 'SPELL_MISMATCH');
});

test('4. other modes between the lock and the Mayhem match never cancel or resolve', () => {
  const waiting = resolve(queueOf(run('a', 1000)), ok(arena(4, 1500)));
  assert.equal(statusOf(waiting.queue, 'a'), 'pending');
  assert.deepEqual(waiting.waiting, { a: 'WAITING_FOR_HISTORY' });
  const later = resolve(queueOf(run('a', 1000)), ok(arena(4, 1500), mayhem(5, 2000), arena(6, 2500)));
  assert.equal(later.history[0]?.gameId, 5);
});

test('5. lock during an active Mayhem → that exact game verifies even though it started before the lock', () => {
  let queue = addRun(queueOf(), run('a', 5000));
  queue = bindRun(queue, [], 'a', active(77), true);
  assert.equal(queue.runs[0]!.activeGameId, 77);
  assert.deepEqual(queue.claimedGameIds, [77]);
  assert.deepEqual(readRequest(queue), { since: 5000, gameIds: [77] });
  const result = resolve(queue, ok(mayhem(77, 4000), mayhem(78, 6000)));
  assert.equal(statusOf(result.queue, 'a'), 'verified');
  assert.equal(result.history[0]?.gameId, 77);
});

test('5b. a bound run is only ever resolved by its own game, and a mismatch there cancels it', () => {
  const queue = { runs: [run('a', 5000, { activeGameId: 77 })], claimedGameIds: [77] };
  assert.equal(statusOf(resolve(queue, ok(mayhem(78, 6000))).queue, 'a'), 'pending');
  const mismatch = resolve(queue, ok(mayhem(77, 4000, { championId: 99 }), mayhem(78, 6000)));
  assert.equal(statusOf(mismatch.queue, 'a'), 'cancelled');
  assert.deepEqual(mismatch.history, []);
});

test('6. a match that ended before the lock can never verify the new run', () => {
  // Unbound: created before the lock, so not eligible; and the client wasn't in a match to bind.
  let queue = addRun(queueOf(), run('a', 5000));
  for (const ended of [{ status: 'ok', active: null } as ActiveRead, { status: 'unavailable' } as ActiveRead]) {
    queue = bindRun(queue, [], 'a', ended, true);
    assert.equal(queue.runs[0]!.activeGameId, undefined);
  }
  const result = resolve(queue, ok(mayhem(70, 1000), mayhem(71, 5000)));
  assert.equal(statusOf(result.queue, 'a'), 'pending'); // 71 was created exactly at the lock: not after it.
  assert.deepEqual(result.history, []);
  // Only a Mayhem match in progress binds; another mode's active game doesn't.
  assert.equal(bindRun(addRun(queueOf(), run('b', 1)), [], 'b', active(5, 1750), true).runs[0]!.activeGameId, undefined);
});

test('7. one active game can be claimed by one challenge only, even across replacement', () => {
  let queue = addRun(queueOf(), run('a', 5000));
  queue = bindRun(queue, [], 'a', active(77), true);
  // A second lock during the same match is stored, but cannot bind the claimed game.
  queue = bindRun(addRun(queue, run('b', 5100)), [], 'b', active(77), true);
  assert.equal(queue.runs.find(entry => entry.id === 'b')!.activeGameId, undefined);
  // Even if the bound run were gone, the claim stays.
  const without = { ...queue, runs: queue.runs.filter(entry => entry.id !== 'a') };
  const retry = bindRun(addRun(without, run('c', 5200)), [], 'c', active(77), true);
  assert.equal(retry.runs.find(entry => entry.id === 'c')!.activeGameId, undefined);
  // Game 77 resolves only "a"; "b" waits for a game created after its lock.
  const result = resolve(queue, ok(mayhem(77, 4000)));
  assert.equal(statusOf(result.queue, 'a'), 'verified');
  assert.equal(statusOf(result.queue, 'b'), 'pending');
  assert.equal(result.history.length, 1);
});

test('7b. a run locked while another waits for the next game never binds, and replacing only removes that waiting run', () => {
  let queue = queueOf(run('waiting', 1000));
  assert.equal(waitingForNextGame(queue)?.id, 'waiting');
  // REPLACE during a match: the old run may have been waiting for exactly this match.
  queue = bindRun(addRun(queue, run('new', 2000), 'waiting'), [], 'new', active(77), false);
  assert.deepEqual(queue.runs.map(entry => [entry.id, entry.activeGameId]), [['new', undefined]]);
  assert.deepEqual(queue.claimedGameIds, [77]);
  // A bound or resolved run is never removed by a replacement.
  const bound = { runs: [run('b', 1, { activeGameId: 5 })], claimedGameIds: [5] };
  assert.equal(addRun(bound, run('x', 2), 'b').runs.length, 2);
  // An older waiting run also blocks binding at bind time.
  const older = bindRun(addRun(queueOf(run('old', 1000)), run('n', 2000)), [], 'n', active(88), true);
  assert.equal(older.runs.find(entry => entry.id === 'n')!.activeGameId, undefined);
});

test('8. match history delay keeps runs pending, with no time limit', () => {
  const queue = queueOf(run('a', 1000), run('b', 2000, { activeGameId: 50 }));
  for (const read of [ok(), ok(arena(9, 1500)), { status: 'clientNotRunning' } as LcuRead, { status: 'unavailable' } as LcuRead]) {
    const result = resolve(queue, read);
    assert.equal(result.queue, queue);
    assert.deepEqual(result.resolved, []);
  }
  assert.deepEqual(resolve(queue, ok()).waiting, { a: 'WAITING_FOR_HISTORY', b: 'WAITING_FOR_HISTORY' });
  assert.deepEqual(resolve(queue, { status: 'clientNotRunning' }).waiting, { a: 'CLIENT_NOT_RUNNING', b: 'CLIENT_NOT_RUNNING' });
  // A published game without the player's record keeps the run pending, and later runs can't skip onto it.
  const unreadable = resolve(queueOf(run('a', 1000), run('c', 1500)), ok({ ...mayhem(5, 2000), player: null }, mayhem(6, 3000)));
  assert.deepEqual(unreadable.waiting, { a: 'INCOMPLETE_DATA' });
  assert.equal(statusOf(unreadable.queue, 'c'), 'verified');
  assert.equal(unreadable.history[0]?.gameId, 6);
});

test('9. pending runs, bindings, resolutions and claims survive storage', () => {
  let queue = bindRun(addRun(queueOf(run('a', 1000)), run('b', 5000)), [], 'b', active(77), false);
  queue = resolve(queue, ok(mayhem(5, 2000, { championId: 9 }))).queue;
  queue = addRun(queue, run('c', 6000, { activeGameId: 88 }));
  const restored = parseQueue(serializeQueue(queue));
  assert.deepEqual(restored, queue);
  assert.deepEqual(restored.runs.map(entry => [entry.id, runStatus(entry)]), [['a', 'cancelled'], ['b', 'pending'], ['c', 'pending']]);
});

test('9b. malformed stored queues fail safely; only invalid records are dropped', () => {
  for (const raw of [null, '', '{', '[]', JSON.stringify({ schema: 2, runs: [] }), JSON.stringify({ schema: 1 })]) assert.deepEqual(parseQueue(raw), { runs: [], claimedGameIds: [] });
  const good = run('good', 1);
  const bad = [null, 'x', { ...run('v1', 1), schema: 1 }, { ...run('items', 1), itemIds: ['1'] }, { ...run('bind', 1), activeGameId: -3 },
    { ...run('res', 1), resolution: { kind: 'won', gameId: 1, gameCreation: 1, resolvedAt: 1 } },
    { ...run('other-game', 1), activeGameId: 5, resolution: { kind: 'verified', gameId: 6, gameCreation: 1, resolvedAt: 1 } },
    { ...good }];
  const parsed = parseQueue(JSON.stringify({ schema: 1, runs: [good, ...bad], claimedGameIds: [3, 'x', 3, -1] }));
  assert.deepEqual(parsed, { runs: [good], claimedGameIds: [3] });
});

test('9c. a pending v0.1.4 challenge migrates into the queue; other legacy states are not invented', () => {
  const legacy = { schema: 1, id: 'old', lockedAt: 1000, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, status: 'pending' };
  assert.deepEqual(migrateLegacyChallenge(JSON.stringify(legacy)), run('old', 1000));
  for (const status of ['verified', 'unverifiable']) assert.equal(migrateLegacyChallenge(JSON.stringify({ ...legacy, status })), null);
  assert.equal(migrateLegacyChallenge('{broken'), null);
});

test('10. several pending runs resolve deterministically, oldest lock first, one game each', () => {
  const queue = queueOf(run('second', 2000), run('first', 1000), run('third', 1000, { championKey: 99 }));
  const games = ok(mayhem(12, 4000), mayhem(11, 3000), mayhem(13, 5000));
  const result = resolve(queue, games);
  // Lock order: first (1000, id "first"), third (1000, id "third"), second (2000).
  assert.deepEqual(result.resolved.map(entry => [entry.id, entry.resolution?.gameId, entry.resolution?.kind]),
    [['first', 11, 'verified'], ['third', 12, 'cancelled'], ['second', 13, 'verified']]);
  assert.deepEqual(resolve({ ...queue, runs: [...queue.runs].reverse() }, games).resolved.map(entry => entry.id), ['first', 'third', 'second']);
  // An unbound run never takes a game reserved by a pending bound run.
  const reserved = resolve(queueOf(run('free', 1000), run('bound', 1500, { activeGameId: 21 })), ok(mayhem(21, 1200), mayhem(22, 3000)));
  assert.deepEqual(reserved.resolved.map(entry => [entry.id, entry.resolution?.gameId]), [['free', 22], ['bound', 21]]);
});

test('a game is never counted twice: history, earlier resolutions and repeated passes', () => {
  const counted: VerifiedRun = {
    challengeId: 'x', lockedAt: 1, gameId: 5, gameCreation: 2000, verifiedAt: 1, championId: 'Lucian', championKey: 236,
    lockedSpellIds: [32, 1], actualSpellIds: [32, 1], challengeItemIds: ITEMS, finalItemIds: [0, 0, 0, 0, 0, 0], completedItemIds: [], win: true,
  };
  const skip = resolve(queueOf(run('a', 1000)), ok(mayhem(5, 2000), mayhem(6, 3000)), [counted]);
  assert.equal(skip.history.at(-1)?.gameId, 6);
  const bound = resolve({ runs: [run('b', 1000, { activeGameId: 5 })], claimedGameIds: [5] }, ok(mayhem(5, 900)), [counted]);
  assert.equal(bound.queue.runs[0]!.resolution?.kind === 'cancelled' && bound.queue.runs[0]!.resolution.reason, 'GAME_ALREADY_COUNTED');
  const once = resolve(queueOf(run('a', 1000)), ok(mayhem(6, 3000)));
  const again = resolve(once.queue, ok(mayhem(6, 3000)), once.history);
  assert.equal(again.history.length, 1);
  assert.deepEqual(again.resolved, []);
});

test('11–13. only verified runs feed the stats; pending and cancelled runs never do', () => {
  const queue = queueOf(run('w1', 1000), run('l1', 1500), run('c1', 2500), run('u1', 3500), run('p1', 9000));
  const result = resolve(queue, ok(
    mayhem(1, 2000), mayhem(2, 3000, { win: false }), mayhem(3, 4000, { championId: 9 }), mayhem(4, 5000, { items: [3031, 0, 0, 0, 0, 0, 0] }),
  ));
  assert.deepEqual(result.queue.runs.map(entry => runStatus(entry)), ['verified', 'verified', 'cancelled', 'unverifiable', 'pending']);
  assert.deepEqual(runStats(result.history), { runs: 2, wins: 1, losses: 1, winRate: 0.5, currentStreak: 0, bestStreak: 1 });
  // A later verified win resumes the streak; the cancelled and unverifiable runs never broke or extended it.
  const later = resolve(result.queue, ok(mayhem(9, 10_000)), result.history);
  assert.deepEqual(runStats(later.history), { runs: 3, wins: 2, losses: 1, winRate: 2 / 3, currentStreak: 1, bestStreak: 1 });
});

test('readRequest lists after the oldest unbound lock and fetches bound games by ID', () => {
  assert.equal(readRequest(queueOf()), null);
  assert.equal(readRequest({ runs: [run('done', 1, { resolution: { kind: 'verified', gameId: 1, gameCreation: 2, resolvedAt: 3 } })], claimedGameIds: [] }), null);
  assert.deepEqual(readRequest(queueOf(run('a', 3000), run('b', 1000), run('c', 500, { activeGameId: 9 }))), { since: 1000, gameIds: [9] });
});

test('15. stored runs keep only known fields: no credentials, PUUIDs or other players survive a round trip', () => {
  const tainted = { ...run('a', 1, { activeGameId: 5 }), puuid: 'p', password: 'secret', authorization: 'Basic x', participants: ['other'] };
  const restored = parseQueue(JSON.stringify({ schema: 1, runs: [tainted], claimedGameIds: [5], token: 'secret' }));
  const serialized = serializeQueue(restored);
  assert.deepEqual(restored.runs, [run('a', 1, { activeGameId: 5 })]);
  for (const leaked of ['puuid', 'secret', 'Basic', 'participants', 'token', 'password']) assert.ok(!serialized.includes(leaked), leaked);
});

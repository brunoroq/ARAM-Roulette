import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDraft, finalizeBuild, generateBuild } from '../src/engine/draft.ts';
import type { DraftRules, GameData } from '../src/types/game.ts';
import { applyOutcome, challengeMatchesDraft, createChallenge, parseChallenge, parseHistory, serializeHistory } from '../src/verify/challenge.ts';
import { runStats } from '../src/verify/stats.ts';
import type { LcuGame, LcuPlayer, LcuRead, LockedChallenge, VerificationData } from '../src/verify/types.ts';
import { frontendSources } from './frontend-sources.ts';
import { checkBuild, parseLcuRead, spellsMatch, unexplainedComponents, verifyChallenge } from '../src/verify/verifier.ts';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const data: VerificationData = read('../src/data/verification.json');
const catalog: GameData = read('../src/data/catalog.json');
const config = read('../src/data/mayhem.json');
const rules: DraftRules = { slots: config.slots, fullBuildRerolls: config.fullBuildRerolls, individualRerolls: config.individualRerolls };

// The real ARAM: Mayhem result read from the local client (Lucian, Mark + Cleanse, victory).
const AXIOM = '6696', GUNBLADE = '3146', LUCIDITY = '3158', WITS = '3091', LUDENS = '6655', HUBRIS = '126697';
const REAL_INVENTORY = [6696, 3146, 3158, 3091, 6655, 126697, 2052];
const REAL_AUGMENTS = [1029, 1220, 1063, 2016];
const LOCKED_AT = 1_000_000;

const challenge: LockedChallenge = {
  schema: 1, id: 'challenge-1', lockedAt: LOCKED_AT, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1,
  itemIds: [AXIOM, LUCIDITY, GUNBLADE, WITS, LUDENS, HUBRIS], status: 'pending',
};

function player(overrides: Partial<LcuPlayer> = {}): LcuPlayer {
  return { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: REAL_INVENTORY, augments: REAL_AUGMENTS, ...overrides };
}
function mayhem(gameId: number, gameCreation: number, overrides: Partial<LcuPlayer> = {}): LcuGame {
  return { gameId, gameCreation, queueId: 2400, mapId: 12, gameMode: 'KIWI', player: player(overrides) };
}
const ok = (...games: LcuGame[]): LcuRead => ({ status: 'ok', games });
const verify = (result: LcuRead, counted: number[] = []) => verifyChallenge(challenge, result, new Set(counted), data, 2_000_000);

test('generated data has the Riot keys and recipe facts the verifier relies on', () => {
  assert.equal(data.champions.Lucian, 236);
  assert.equal(data.spells.SummonerSnowball, 32);
  assert.equal(data.spells.SummonerBoost, 1);
  for (const champion of catalog.champions) assert.ok(Number.isInteger(data.champions[champion.id]), champion.id);
  for (const item of catalog.items) assert.equal(data.items[item.id]?.kind, 'shop', item.id);
  assert.deepEqual(data.items[HUBRIS]?.from, ['3134', '3133']);
  assert.equal(data.items['2052']?.kind, 'auxiliary');
  assert.equal(data.items['3040']?.transformsFrom, '3003');
});

test('1. exact six-item match from the real game', () => {
  assert.deepEqual(checkBuild(challenge.itemIds, REAL_INVENTORY, REAL_AUGMENTS, data), {
    status: 'compatible', completedItemIds: challenge.itemIds,
  });
});

test('2. inventory slot order does not matter', () => {
  const shuffled = [126697, 3091, 6655, 3158, 3146, 6696, 2052];
  assert.equal(checkBuild(challenge.itemIds, shuffled, [], data).status, 'compatible');
});

test('3. partial build with components of an unfinished generated item', () => {
  // Hubris unfinished; Serrated Dirk and Caulfield's Warhammer are its direct components.
  const result = checkBuild(challenge.itemIds, [6696, 3158, 3146, 3091, 3134, 3133, 2052], [], data);
  assert.deepEqual(result, { status: 'compatible', completedItemIds: [AXIOM, LUCIDITY, GUNBLADE, WITS] });
});

test('4. nested components several recipe levels down', () => {
  // Hubris → Serrated Dirk → Long Sword, and Hubris → Caulfield's → Long Sword.
  assert.equal(checkBuild(challenge.itemIds, [6696, 3158, 3146, 3091, 6655, 1036], [], data).status, 'compatible');
  assert.equal(checkBuild(challenge.itemIds, [6696, 3158, 3146, 3091, 1036, 1036], [], data).status, 'compatible');
  // A Dirk already contains its two Long Swords; Caulfield's has room for two more, and the
  // unfinished Gunblade's Vampiric Scepter for a third.
  assert.equal(checkBuild(challenge.itemIds, [6696, 3158, 3134, 1036, 1036, 0], [], data).status, 'compatible');
  assert.equal(checkBuild(challenge.itemIds, [6696, 3134, 1036, 1036, 1036, 0], [], data).status, 'compatible');
  // Only Hubris uses a Serrated Dirk, so a second one is unexplained.
  assert.deepEqual(checkBuild(challenge.itemIds, [6696, 3158, 3146, 3091, 3134, 3134], [], data), { status: 'mismatch', itemIds: ['3134', '3134'] });
});

test('components can explain unfinished items only, never finished ones', () => {
  // Hubris is finished, so a spare Serrated Dirk belongs to nothing in the challenge.
  assert.deepEqual(checkBuild(challenge.itemIds, [6696, 3158, 3146, 3091, 126697, 3134], [], data), { status: 'mismatch', itemIds: ['3134'] });
});

test('5. an unrelated completed shop item is a build mismatch', () => {
  assert.deepEqual(checkBuild(challenge.itemIds, [6696, 3158, 3146, 3091, 6655, 3031, 2052], [], data), { status: 'mismatch', itemIds: ['3031'] });
  assert.equal(checkBuild(challenge.itemIds, [6696, 3158, 1055, 0, 0, 0], [], data).status, 'mismatch', 'Starter item outside the challenge');
});

test('6. Poro-Snax and other consumables are ignored in any slot', () => {
  assert.equal(checkBuild(challenge.itemIds, [2052, 2003, 6696, 3158, 0, 0, 2052], [], data).status, 'compatible');
});

test('7. empty slots are fine and the build need not be finished', () => {
  assert.deepEqual(checkBuild(challenge.itemIds, [0, 0, 0, 0, 0, 0, 0], [], data), { status: 'compatible', completedItemIds: [] });
});

test('8. duplicates: shared components are fine, a second completed copy cannot be explained', () => {
  assert.equal(checkBuild(challenge.itemIds, [6696, 3158, 3146, 3091, 1036, 1036], [], data).status, 'compatible');
  assert.deepEqual(checkBuild(challenge.itemIds, [6696, 6696, 3158, 0, 0, 0], [], data), { status: 'unsupported', itemIds: ['6696'] });
});

test('9. generated boots: finished, in progress, or replaced by other boots', () => {
  assert.deepEqual(checkBuild(challenge.itemIds, [3158, 0, 0, 0, 0, 0], [], data), { status: 'compatible', completedItemIds: [LUCIDITY] });
  assert.deepEqual(checkBuild(challenge.itemIds, [1001, 6696, 0, 0, 0, 0], [], data), { status: 'compatible', completedItemIds: [AXIOM] });
  assert.deepEqual(checkBuild(challenge.itemIds, [3006, 6696, 0, 0, 0, 0], [], data), { status: 'mismatch', itemIds: ['3006'] });
});

test('10. automatic transformations of a generated item count as that item', () => {
  const tear = ['3003', '3158', '6696', '3146', '3091', '6655'];
  assert.deepEqual(checkBuild(tear, [3040, 3158, 0, 0, 0, 0], [], data), { status: 'compatible', completedItemIds: ['3003', '3158'] });
  // Seraph's Embrace when Archangel's Staff was not generated cannot be explained.
  assert.deepEqual(checkBuild(challenge.itemIds, [3040, 0, 0, 0, 0, 0], [], data), { status: 'unsupported', itemIds: ['3040'] });
});

test('11. unknown special items make the build unsupported, not a failure', () => {
  // Tier-3 boots are not sold on map 12; they could come from an augment.
  assert.deepEqual(checkBuild(challenge.itemIds, [6696, 3171, 0, 0, 0, 0], REAL_AUGMENTS, data), { status: 'unsupported', itemIds: ['3171'] });
  assert.deepEqual(checkBuild(challenge.itemIds, [6696, 9999999, 0, 0, 0, 0], [], data), { status: 'unsupported', itemIds: ['9999999'] });
  // A clear unrelated shop item still decides the result.
  assert.equal(checkBuild(challenge.itemIds, [3031, 3171, 0, 0, 0, 0], [], data).status, 'mismatch');
});

test('confirmed augment exceptions are honored only for augments the player took', () => {
  const exceptions = { 1029: ['3171'] };
  assert.equal(checkBuild(challenge.itemIds, [6696, 3171, 0, 0, 0, 0], [1029], data, exceptions).status, 'compatible');
  assert.equal(checkBuild(challenge.itemIds, [6696, 3171, 0, 0, 0, 0], [1220], data, exceptions).status, 'unsupported');
});

test('recipe packing is deterministic and guards against cycles', () => {
  const synthetic: VerificationData = { champions: {}, spells: {}, items: {
    T: { kind: 'shop', from: ['M', 'L'] }, M: { kind: 'shop', from: ['L', 'L'] }, L: { kind: 'shop' },
    C: { kind: 'shop', from: ['D'] }, D: { kind: 'shop', from: ['C'] },
  } };
  assert.deepEqual(unexplainedComponents(['L', 'L', 'L'], ['T'], synthetic), []);
  assert.deepEqual(unexplainedComponents(['M', 'L'], ['T'], synthetic), []);
  assert.deepEqual(unexplainedComponents(['M', 'L', 'L'], ['T'], synthetic), ['L', 'L', 'M']);
  assert.deepEqual(unexplainedComponents(['L', 'X'], ['T'], synthetic), ['X']);
  assert.deepEqual(unexplainedComponents(['D'], ['C'], synthetic), []);
  assert.deepEqual(unexplainedComponents(['L'], [], synthetic), ['L']);
});

test('the real game verifies end to end', () => {
  const outcome = verify(ok(mayhem(1628325258, LOCKED_AT + 60_000)));
  assert.equal(outcome.kind, 'verified');
  if (outcome.kind !== 'verified') return;
  assert.deepEqual(outcome.run, {
    challengeId: 'challenge-1', lockedAt: LOCKED_AT, gameId: 1628325258, gameCreation: LOCKED_AT + 60_000, verifiedAt: 2_000_000,
    championId: 'Lucian', championKey: 236, lockedSpellIds: [32, 1], actualSpellIds: [32, 1],
    challengeItemIds: challenge.itemIds, finalItemIds: REAL_INVENTORY.slice(0, 6), completedItemIds: challenge.itemIds, win: true,
  });
});

test('12. a different champion keeps the challenge pending', () => {
  assert.deepEqual(verify(ok(mayhem(1, LOCKED_AT + 1, { championId: 1 }))), { kind: 'pending', reason: 'CHAMPION_DIFFERS' });
});

test('13. different summoner spells are unverifiable, with the other checks reported', () => {
  assert.deepEqual(verify(ok(mayhem(5, LOCKED_AT + 1, { spell2Id: 4 }))), {
    kind: 'unverifiable', result: { gameId: 5, reason: 'SPELL_MISMATCH', spellsMatch: false, build: 'compatible', completed: 6 },
  });
});

test('14. D/F is compared unordered because the client does not document slot meaning', () => {
  assert.equal(spellsMatch(challenge, player({ spell1Id: 1, spell2Id: 32 })), true);
  assert.equal(verify(ok(mayhem(1, LOCKED_AT + 1, { spell1Id: 1, spell2Id: 32 }))).kind, 'verified');
  assert.equal(spellsMatch(challenge, player({ spell1Id: 32, spell2Id: 32 })), false);
});

test('15. a non-Mayhem game is never a candidate', () => {
  const arena: LcuGame = { gameId: 2, gameCreation: LOCKED_AT + 1, queueId: 1750, mapId: 30, gameMode: 'CHERRY', player: player() };
  const aram: LcuGame = { gameId: 3, gameCreation: LOCKED_AT + 1, queueId: 450, mapId: 12, gameMode: 'ARAM', player: player() };
  assert.deepEqual(verify(ok(arena, aram)), { kind: 'pending', reason: 'NO_MAYHEM_GAME' });
});

test('queue 2400 is authoritative; redundant map/mode fields are not required', () => {
  assert.equal(verify(ok({ ...mayhem(4, LOCKED_AT + 1), mapId: null, gameMode: 'SOMETHING_NEW' })).kind, 'verified');
});

test('16. games created before (or at) the lock are ignored', () => {
  assert.deepEqual(verify(ok(mayhem(1, LOCKED_AT - 1), mayhem(2, LOCKED_AT))), { kind: 'pending', reason: 'NO_MAYHEM_GAME' });
});

test('17. other modes between lock and the challenge game are skipped', () => {
  const arena: LcuGame = { gameId: 10, gameCreation: LOCKED_AT + 10, queueId: 1750, mapId: 30, gameMode: 'CHERRY', player: null };
  const otherChampion = mayhem(11, LOCKED_AT + 20, { championId: 1 });
  const outcome = verify(ok(mayhem(12, LOCKED_AT + 30), otherChampion, arena));
  assert.equal(outcome.kind === 'verified' && outcome.run.gameId, 12);
});

test('the earliest verifying game wins; otherwise the earliest candidate explains why', () => {
  const failing = mayhem(20, LOCKED_AT + 10, { spell1Id: 4 });
  const passing = mayhem(21, LOCKED_AT + 20);
  assert.equal((verify(ok(passing, failing)) as { run: { gameId: number } }).run.gameId, 21);
  const mismatch = mayhem(22, LOCKED_AT + 30, { items: [3031, 0, 0, 0, 0, 0, 2052] });
  const unsupported = mayhem(23, LOCKED_AT + 40, { items: [3171, 0, 0, 0, 0, 0, 2052] });
  assert.deepEqual(verify(ok(unsupported, mismatch)), {
    kind: 'unverifiable', result: { gameId: 22, reason: 'BUILD_MISMATCH', spellsMatch: true, build: 'mismatch', completed: 0 },
  });
  assert.equal((verify(ok(unsupported)) as { result: { reason: string } }).result.reason, 'UNSUPPORTED_ITEM');
});

test('18. a game already counted cannot be counted twice', () => {
  assert.deepEqual(verify(ok(mayhem(7, LOCKED_AT + 1)), [7]), { kind: 'pending', reason: 'ALREADY_COUNTED' });
  const first = verify(ok(mayhem(7, LOCKED_AT + 1)));
  assert.equal(first.kind, 'verified');
  const once = applyOutcome(challenge, [], first);
  const twice = applyOutcome({ ...challenge, id: 'challenge-2' }, once.runs, first);
  assert.equal(twice.runs.length, 1);
  assert.equal(parseHistory(serializeHistory([...once.runs, ...once.runs])).length, 1);
});

test('19. League Client unavailable states keep the challenge pending', () => {
  assert.deepEqual(verify({ status: 'clientNotRunning' }), { kind: 'pending', reason: 'CLIENT_NOT_RUNNING' });
  assert.deepEqual(verify({ status: 'notSignedIn' }), { kind: 'pending', reason: 'NOT_SIGNED_IN' });
  assert.deepEqual(verify({ status: 'unavailable' }), { kind: 'pending', reason: 'LCU_UNAVAILABLE' });
  assert.deepEqual(verify({ status: 'desktopOnly' }), { kind: 'pending', reason: 'DESKTOP_ONLY' });
  const pending = applyOutcome(challenge, [], { kind: 'pending', reason: 'CLIENT_NOT_RUNNING' });
  assert.equal(pending.challenge, challenge);
});

test('20. malformed or incomplete client replies fail safely', () => {
  for (const reply of [null, 'ok', 42, {}, { status: 'weird' }, { status: 'ok' }, { status: 'ok', games: [null] },
    { status: 'ok', games: [{ gameId: '1', gameCreation: 1, queueId: 2400 }] },
    { status: 'ok', games: [{ gameId: 1, gameCreation: 1, queueId: 2400, player: { ...player(), items: [1, 2, 3] } }] },
    { status: 'ok', games: [{ gameId: 1, gameCreation: 1, queueId: 2400, player: { ...player(), win: 'Win' } }] }]) {
    assert.deepEqual(parseLcuRead(reply), { status: 'unavailable' }, JSON.stringify(reply));
  }
  assert.deepEqual(verify(ok({ ...mayhem(1, LOCKED_AT + 1), player: null })), { kind: 'pending', reason: 'INCOMPLETE_DATA' });
  assert.deepEqual(parseLcuRead({ status: 'clientNotRunning' }), { status: 'clientNotRunning' });
});

test('21. client replies are reduced to known fields, so nothing extra reaches the UI', () => {
  const parsed = parseLcuRead({
    status: 'ok', password: 'secret', puuid: 'p',
    games: [{ gameId: 1, gameCreation: LOCKED_AT + 1, queueId: 2400, mapId: 12, gameMode: 'KIWI', participants: ['other'],
      player: { ...player(), puuid: 'p', summonerName: 'Self', token: 'secret' } }],
  });
  const serialized = JSON.stringify(parsed);
  for (const leaked of ['secret', 'puuid', 'Self', 'participants', 'token', 'password']) assert.ok(!serialized.includes(leaked), leaked);
  assert.equal(parsed.status === 'ok' && parsed.games[0]?.player?.championId, 236);
});

test('the frontend never handles League Client credentials or Riot API keys', () => {
  const sources = frontendSources(/\.(ts|tsx)$/);
  assert.ok(sources.length > 0);
  for (const { path, source } of sources) {
    assert.ok(!/lockfile|riot:|Authorization|X-Riot-Token|RIOT_API_KEY|api\.riotgames\.com|\/lol-match/.test(source), path);
  }
});

test('locking freezes the final D/F assignment and item slots by ID', () => {
  const context = { data: catalog, rules, random: () => 0.5 };
  const lucian = catalog.champions.find(champion => champion.id === 'Lucian')!;
  const draft = finalizeBuild(generateBuild(createDraft(lucian, context), context));
  const swapped = { ...draft, spellKeys: ['F', 'D'] as const };
  const locked = createChallenge(swapped, data, 123, 'id-1');
  assert.equal(locked.championKey, 236);
  assert.equal(locked.spellD, data.spells[draft.spells[1].id]);
  assert.equal(locked.spellF, data.spells[draft.spells[0].id]);
  assert.deepEqual(locked.itemIds, draft.buildSlots.map(slot => slot.item.id));
  assert.equal(locked.status, 'pending');
  assert.ok(challengeMatchesDraft(locked, swapped, data));
  assert.ok(!challengeMatchesDraft(locked, draft, data));
  assert.throws(() => createChallenge(generateBuild(createDraft(lucian, context), context), data, 1), /finalized/);
});

test('stored challenges round-trip and invalid ones are discarded', () => {
  assert.deepEqual(parseChallenge(JSON.stringify(challenge)), challenge);
  const unverifiable = applyOutcome(challenge, [], verify(ok(mayhem(5, LOCKED_AT + 1, { spell2Id: 4 })))).challenge;
  assert.deepEqual(parseChallenge(JSON.stringify(unverifiable)), unverifiable);
  for (const bad of [null, '', '{', '[]', JSON.stringify({ ...challenge, schema: 2 }), JSON.stringify({ ...challenge, itemIds: ['1'] }),
    JSON.stringify({ ...challenge, status: 'won' }), JSON.stringify({ ...challenge, status: 'unverifiable' }),
    JSON.stringify({ ...challenge, spellF: 32 }), JSON.stringify({ ...challenge, lockedAt: 'yesterday' })]) {
    assert.equal(parseChallenge(bad), null, String(bad));
  }
});

test('verifying records the run; totals are only runs, wins and losses', () => {
  const won = applyOutcome(challenge, [], verify(ok(mayhem(1, LOCKED_AT + 1))));
  assert.equal(won.challenge.status, 'verified');
  const lost = applyOutcome({ ...challenge, id: 'challenge-2' }, won.runs, verify(ok(mayhem(2, LOCKED_AT + 1, { win: false })), [1]));
  assert.deepEqual(runStats(lost.runs), { runs: 2, wins: 1, losses: 1, winRate: 0.5, currentStreak: 0, bestStreak: 1 });
  assert.deepEqual(parseHistory(serializeHistory(lost.runs)), lost.runs);
  // A verified challenge is final.
  assert.equal(applyOutcome(won.challenge, won.runs, verify(ok(mayhem(3, LOCKED_AT + 1)))).runs.length, 1);
});

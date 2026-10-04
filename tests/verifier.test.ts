import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frontendSources } from './frontend-sources.ts';
import { createDraft, finalizeBuild, generateBuild } from '../src/engine/draft.ts';
import type { DraftRules, GameData } from '../src/types/game.ts';
import { challengeMatchesDraft, createChallenge } from '../src/verify/challenge.ts';
import type { LcuGame, LcuPlayer, LockedChallenge, VerificationData } from '../src/verify/types.ts';
import { checkBuild, evaluateGame, parseActiveRead, parseLcuRead, spellsMatch, unexplainedComponents } from '../src/verify/verifier.ts';

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
  schema: 2, id: 'challenge-1', lockedAt: LOCKED_AT, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1,
  itemIds: [AXIOM, LUCIDITY, GUNBLADE, WITS, LUDENS, HUBRIS],
};

function player(overrides: Partial<LcuPlayer> = {}): LcuPlayer {
  return { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: REAL_INVENTORY, augments: REAL_AUGMENTS, ...overrides };
}
function mayhem(gameId: number, gameCreation: number, overrides: Partial<LcuPlayer> = {}): LcuGame {
  return { gameId, gameCreation, queueId: 2400, mapId: 12, gameMode: 'KIWI', player: player(overrides) };
}
const judge = (game: LcuGame) => evaluateGame(challenge, game as LcuGame & { player: LcuPlayer }, data, 2_000_000);

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
  const { resolution, verified } = judge(mayhem(1628325258, LOCKED_AT + 60_000));
  assert.deepEqual(resolution, { kind: 'verified', gameId: 1628325258, gameCreation: LOCKED_AT + 60_000, resolvedAt: 2_000_000 });
  assert.deepEqual(verified, {
    challengeId: 'challenge-1', lockedAt: LOCKED_AT, gameId: 1628325258, gameCreation: LOCKED_AT + 60_000, verifiedAt: 2_000_000,
    championId: 'Lucian', championKey: 236, lockedSpellIds: [32, 1], actualSpellIds: [32, 1],
    challengeItemIds: challenge.itemIds, finalItemIds: REAL_INVENTORY.slice(0, 6), completedItemIds: challenge.itemIds, win: true,
  });
});

test('12–13. a different champion or spell pair cancels; it is not a loss or a build problem', () => {
  assert.deepEqual(judge(mayhem(1, LOCKED_AT + 1, { championId: 1 })), {
    resolution: { kind: 'cancelled', gameId: 1, gameCreation: LOCKED_AT + 1, resolvedAt: 2_000_000, reason: 'CHAMPION_MISMATCH', championMatch: false, spellsMatch: true },
    verified: null,
  });
  assert.deepEqual(judge(mayhem(2, LOCKED_AT + 1, { spell2Id: 4 })).resolution, {
    kind: 'cancelled', gameId: 2, gameCreation: LOCKED_AT + 1, resolvedAt: 2_000_000, reason: 'SPELL_MISMATCH', championMatch: true, spellsMatch: false,
  });
});

test('14. D/F is compared unordered because the client does not document slot meaning', () => {
  assert.equal(spellsMatch(challenge, player({ spell1Id: 1, spell2Id: 32 })), true);
  assert.equal(judge(mayhem(1, LOCKED_AT + 1, { spell1Id: 1, spell2Id: 32 })).resolution.kind, 'verified');
  assert.equal(spellsMatch(challenge, player({ spell1Id: 32, spell2Id: 32 })), false);
});

test('a matching game with an unrelated or unexplained item is unverifiable, never a loss', () => {
  assert.deepEqual(judge(mayhem(3, 5, { items: [3031, 0, 0, 0, 0, 0, 2052] })).resolution,
    { kind: 'unverifiable', gameId: 3, gameCreation: 5, resolvedAt: 2_000_000, reason: 'BUILD_MISMATCH' });
  assert.deepEqual(judge(mayhem(4, 5, { items: [3171, 0, 0, 0, 0, 0, 2052] })).resolution,
    { kind: 'unverifiable', gameId: 4, gameCreation: 5, resolvedAt: 2_000_000, reason: 'UNSUPPORTED_ITEM' });
  assert.equal(judge(mayhem(5, 5, { win: false })).verified?.win, false);
});

test('20. malformed or incomplete client replies fail safely', () => {
  for (const reply of [null, 'ok', 42, {}, { status: 'weird' }, { status: 'ok' }, { status: 'ok', games: [null] },
    { status: 'ok', games: [{ gameId: '1', gameCreation: 1, queueId: 2400 }] },
    { status: 'ok', games: [{ gameId: 1, gameCreation: 1, queueId: 2400, player: { ...player(), items: [1, 2, 3] } }] },
    { status: 'ok', games: [{ gameId: 1, gameCreation: 1, queueId: 2400, player: { ...player(), win: 'Win' } }] }]) {
    assert.deepEqual(parseLcuRead(reply), { status: 'unavailable' }, JSON.stringify(reply));
  }
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
  assert.deepEqual(locked, {
    schema: 2, id: 'id-1', lockedAt: 123, championId: 'Lucian', championKey: 236,
    spellD: data.spells[draft.spells[1].id], spellF: data.spells[draft.spells[0].id], itemIds: draft.buildSlots.map(slot => slot.item.id),
  });
  assert.equal(locked.activeGameId, undefined);
  assert.equal(locked.resolution, undefined);
  assert.ok(challengeMatchesDraft(locked, swapped, data));
  assert.ok(!challengeMatchesDraft(locked, draft, data));
  assert.throws(() => createChallenge(generateBuild(createDraft(lucian, context), context), data, 1), /finalized/);
});

test('active-game replies are validated strictly', () => {
  assert.deepEqual(parseActiveRead({ status: 'ok', active: { gameId: 77, queueId: 2400, phase: 'InProgress', players: ['x'] } }), { status: 'ok', active: { gameId: 77, queueId: 2400 } });
  assert.deepEqual(parseActiveRead({ status: 'ok', active: null }), { status: 'ok', active: null });
  assert.deepEqual(parseActiveRead({ status: 'clientNotRunning' }), { status: 'clientNotRunning' });
  for (const reply of [null, 'ok', {}, { status: 'ok' }, { status: 'ok', active: { gameId: 0, queueId: 2400 } }, { status: 'ok', active: { gameId: '7', queueId: 2400 } }]) {
    assert.deepEqual(parseActiveRead(reply), { status: 'unavailable' }, JSON.stringify(reply));
  }
});

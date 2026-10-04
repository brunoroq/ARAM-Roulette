import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  CliError, ENDPOINTS, LcuError, createLcuClient, describeConnectionError, findOwnParticipant, formatGameSummary,
  gamesFromList, main, newestGameId, ownEndOfGameRecord, parseArgs, parseGameId, parseLockfile, sanitize,
  summarizeGame, timelineFrames,
} from '../scripts/lcu-inspect.mjs';

// Synthetic placeholders only: no real lockfile, account or game.
const PASSWORD = 'placeholder-lcu-password';
const LOCKFILE = `LeagueClient:1234:54321:${PASSWORD}:https`;
const PUUID = 'puuid-self';

test('parses CLI options', () => {
  assert.deepEqual(parseArgs([]), { latest: false, gameId: null, count: 5, lockfile: null, raw: false, help: false });
  assert.equal(parseArgs(['--latest']).latest, true);
  assert.equal(parseArgs(['--game-id', '42']).gameId, '42');
  assert.equal(parseArgs(['--game-id=LA2_42']).gameId, '42');
  assert.equal(parseArgs(['--count', '20', '--raw', '--lockfile', 'D:\\Riot\\lockfile']).lockfile, 'D:\\Riot\\lockfile');
  for (const argv of [['--latest', '--game-id', '1'], ['--latest', '--count', '3'], ['--count', '0'], ['--count', '21'], ['--game-id', 'abc'], ['--queue', '1'], ['extra'], ['--lockfile']]) {
    assert.throws(() => parseArgs(argv), CliError, argv.join(' '));
  }
  assert.throws(() => parseGameId('1/../2'), CliError);
});

test('parses the lockfile and rejects malformed ones', () => {
  assert.deepEqual(parseLockfile(`${LOCKFILE}\n`), { pid: 1234, port: 54321, password: PASSWORD });
  for (const bad of ['', 'a:b:c', 'LeagueClient:1:notaport:pw:https', 'LeagueClient:1:70000:pw:https', 'LeagueClient:1:2:pw:http', 'LeagueClient:1:2::https']) {
    assert.throws(() => parseLockfile(bad), LcuError, bad);
  }
  assert.throws(() => parseLockfile('LeagueClient:1:2:pw:http'), error => !error.message.includes('pw'));
});

test('describes connection failures without trusting unverified TLS', () => {
  assert.match(describeConnectionError({ code: 'ECONNREFUSED' }), /not be running|stale/);
  assert.match(describeConnectionError({ code: 'SELF_SIGNED_CERT_IN_CHAIN' }), /TLS verification.*Not continuing/);
  assert.match(describeConnectionError({ code: 'ETIMEDOUT' }), /did not answer/);
});

test('client sends only loopback GET requests with the pinned CA', async () => {
  const calls = [];
  const request = (options, onResponse) => {
    calls.push(options);
    const req = new EventEmitter();
    req.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      onResponse(response);
      response.emit('data', Buffer.from('{"ok":true}'));
      response.emit('end');
    };
    req.destroy = () => {};
    return req;
  };
  const get = createLcuClient({ port: 54321, password: PASSWORD, ca: 'test-ca', request });
  assert.deepEqual(await get('/lol-summoner/v1/current-summoner'), { status: 200, body: { ok: true } });
  assert.equal(calls[0].host, '127.0.0.1');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].ca, 'test-ca');
  assert.equal(calls[0].rejectUnauthorized, undefined, 'Certificate verification stays on');
  assert.equal(calls[0].headers.Authorization, `Basic ${Buffer.from(`riot:${PASSWORD}`).toString('base64')}`);
});

const game = {
  gameId: 1001, platformId: 'XX1', gameCreation: 1700000000000, gameDuration: 905, queueId: 1, mapId: 12, gameMode: 'MODE', gameType: 'TYPE', newFlag: true,
  teams: [{ teamId: 100 }],
  participantIdentities: [
    { participantId: 1, player: { puuid: 'puuid-other', gameName: 'Other', tagLine: 'OTH' } },
    { participantId: 2, player: { puuid: PUUID, gameName: 'Self', tagLine: 'SELF', summonerId: 77 } },
  ],
  participants: [
    { participantId: 1, championId: 1, stats: { win: false, item0: 9 } },
    { participantId: 2, championId: 166, teamId: 100, spell1Id: 4, spell2Id: 6,
      stats: { win: true, item0: 1036, item1: 3006, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0, playerAugment1: 55, playerAugment2: 0, kills: 3 } },
  ],
};

test('finds only the signed-in player by PUUID', () => {
  assert.equal(findOwnParticipant(game, PUUID).championId, 166);
  assert.equal(findOwnParticipant(game, 'missing'), null);
  assert.equal(findOwnParticipant({ participants: [{ championId: 5 }] }, PUUID), null, 'No positional guessing');
  assert.equal(findOwnParticipant({ participants: [{ puuid: PUUID, championId: 5 }] }, PUUID).championId, 5);
});

test('summarizes own record and reports unknown game fields', () => {
  const summary = summarizeGame(game, PUUID);
  assert.deepEqual(summary.player, {
    participantId: 2, championId: 166, teamId: 100, spell1Id: 4, spell2Id: 6, win: true,
    items: { item0: 1036, item1: 3006, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0 },
    augments: { playerAugment1: 55, playerAugment2: 0 },
  });
  assert.deepEqual(summary.otherFields, { newFlag: true });
  assert.deepEqual(summary.nestedFields, []);
  const text = formatGameSummary(summary, new Map([['1036', 'Long Sword']]));
  assert.match(text, /item0=1036 \(Long Sword\) item1=3006 \(not in local Data Dragon snapshot\)/);
  assert.match(text, /gameDuration: +905 \(15:05 if seconds\)/);
  assert.ok(!/Other|puuid/.test(text));
  assert.match(formatGameSummary(summarizeGame({ gameId: 1 }, PUUID)), /your record was not found/);
});

test('reads list, timeline and end-of-game shapes defensively', () => {
  assert.equal(gamesFromList({ games: { games: [game] } }).length, 1);
  assert.equal(gamesFromList({ games: [game] }).length, 1);
  assert.deepEqual(gamesFromList(null), []);
  assert.equal(newestGameId([{ gameId: 1, gameCreation: 5 }, { gameId: 2, gameCreation: 9 }, { gameCreation: 99 }]), '2');
  assert.equal(newestGameId([]), null);
  assert.equal(timelineFrames({ frames: [{}] }).length, 1);
  assert.equal(timelineFrames({ info: { frames: [{}, {}] } }).length, 2);
  assert.deepEqual(timelineFrames('nope'), []);
  assert.equal(ownEndOfGameRecord({ localPlayer: { championId: 3 } }, PUUID).championId, 3);
  assert.equal(ownEndOfGameRecord({ teams: [{ players: [{ puuid: 'x' }, { puuid: PUUID, championId: 4 }] }] }, PUUID).championId, 4);
  assert.equal(ownEndOfGameRecord({ teams: [{ players: [{ puuid: 'x' }] }] }, PUUID), null);
});

test('sanitizes identifiers at any depth', () => {
  assert.deepEqual(sanitize({ puuid: 'p', a: [{ summonerName: 's', gameName: 'g', item0: 1 }], nested: { riotIdTagline: 't', accountId: 1, win: true } }), {
    a: [{ item0: 1 }], nested: { win: true },
  });
});

function fakeClient(routes) {
  const paths = [];
  const createClient = ({ password }) => {
    assert.equal(password, PASSWORD);
    return async path => {
      paths.push(path);
      return path in routes ? { status: 200, body: routes[path] } : { status: 404, body: { message: 'not found' } };
    };
  };
  return { createClient, paths };
}

async function run(argv, { routes = {}, platform = 'win32', readFile = () => LOCKFILE } = {}) {
  const out = [];
  const err = [];
  const fake = fakeClient(routes);
  const code = await main({ argv, platform, readFile, createClient: fake.createClient, stdout: line => out.push(line), stderr: line => err.push(line), itemNames: null });
  return { code, out: out.join('\n'), err: err.join('\n'), paths: fake.paths };
}

const timeline = { frames: [
  { events: [{ type: 'ITEM_PURCHASED', timestamp: 30000, participantId: 2, itemId: 1036 }, { type: 'ITEM_PURCHASED', timestamp: 1000, participantId: 1, itemId: 9 }] },
  { events: [{ type: 'ITEM_UNDO', timestamp: 65000, participantId: 2, beforeId: 1036, afterId: 0 }, { type: 'SKILL_LEVEL_UP', timestamp: 61000, participantId: 2 }] },
] };
const routes = {
  [ENDPOINTS.currentSummoner()]: { puuid: PUUID, gameName: 'Self', tagLine: 'SELF' },
  [ENDPOINTS.matchList(5)]: { games: { games: [{ ...game, gameId: 1000, gameCreation: 1 }, game] } },
  [ENDPOINTS.game(1001)]: game,
  [ENDPOINTS.timeline(1001)]: timeline,
};

test('lists recent games through mocked read-only endpoints', async () => {
  const result = await run([], { routes });
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /Signed in as Self#SELF/);
  assert.match(result.out, /Local match history: 2 game\(s\)/);
  assert.match(result.out, /End-of-game block not available \(status 404\)/);
  assert.match(result.out, /404 +\/lol-end-of-game\/v1\/eog-stats-block/);
  assert.ok(!result.out.includes(PUUID) && !result.out.includes('Other'));
});

test('inspects the latest game, its timeline and own raw records only', async () => {
  const result = await run(['--latest', '--raw'], { routes: { ...routes, [ENDPOINTS.endOfGame()]: { gameId: 1001, localPlayer: { championId: 166, puuid: PUUID, items: [1036] }, teams: [{ players: [{ puuid: 'puuid-other' }] }] } } });
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /Newest game in local match history: 1001/);
  assert.match(result.out, /\[00:30\] ITEM_PURCHASED +itemId=1036\n.*\[01:05\] ITEM_UNDO +beforeId=1036 afterId=0/);
  assert.match(result.out, /Event types with your participantId: \{"ITEM_PURCHASED":1,"ITEM_UNDO":1,"SKILL_LEVEL_UP":1\}/);
  assert.match(result.out, /your record keys: championId, puuid, items/);
  for (const secret of [PUUID, 'puuid-other', 'Other', PASSWORD, '"summonerId"']) assert.ok(!result.out.includes(secret), secret);
  assert.ok(result.paths.every(path => path.startsWith('/lol-')));
});

test('reports unavailable details and timeline instead of inventing them', async () => {
  const result = await run(['--game-id', '555'], { routes: { [ENDPOINTS.currentSummoner()]: { puuid: PUUID } } });
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /Game 555: details not available \(status 404\)/);
  assert.match(result.out, /Timeline not available \(status 404\)/);
});

test('fails clearly without a lockfile, on other platforms, or with stale credentials', async () => {
  const missing = await run([], { readFile: () => { throw new Error('ENOENT'); } });
  assert.equal(missing.code, 1);
  assert.match(missing.err, /lockfile not found at C:\\Riot Games/);
  const linux = await run([], { platform: 'linux' });
  assert.match(linux.err, /Pass --lockfile/);
  const rejected = await main({
    argv: [], platform: 'win32', readFile: () => LOCKFILE, itemNames: null, stdout: () => {},
    createClient: () => async () => ({ status: 401, body: null }),
    stderr: line => { assert.match(line, /rejected the lockfile credentials/); assert.ok(!line.includes(PASSWORD)); },
  });
  assert.equal(rejected, 1);
  const refused = [];
  const code = await main({
    argv: [], platform: 'win32', readFile: () => LOCKFILE, itemNames: null, stdout: () => {}, stderr: line => refused.push(line),
    createClient: () => async () => { throw new LcuError(`connection refused ${PASSWORD}`); },
  });
  assert.equal(code, 1);
  assert.ok(!refused.join('').includes(PASSWORD), 'Password is redacted from errors');
});

test('the shipped frontend never references the League Client inspector', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const files = directory => readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => (entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  for (const path of files(new URL('../src', import.meta.url).pathname)) {
    if (!/\.(ts|tsx|js)$/.test(path)) continue;
    assert.ok(!/lcu-inspect|lol-match-history|lockfile/.test(readFileSync(path, 'utf8')), path);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendSources } from './frontend-sources.ts';
import {
  CliError, RiotApiError, accountPath, accountRegion, countEventTypes, createRiotClient, describeHttpError,
  findParticipant, findTimelineParticipantId, formatEvent, formatTimestamp, itemEvents, main, matchIdsPath,
  parseArgs, parseRiotId, readApiKey, redact, summarizeMatch,
} from '../scripts/riot-inspect.mjs';

// Synthetic placeholder values only: no real key, account, PUUID or match.
const FAKE_KEY = 'test-placeholder-key-0000';
const PUUID = 'puuid-player';

function response(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

test('parses Riot IDs and rejects malformed ones', () => {
  assert.deepEqual(parseRiotId('Game Name#LAS'), { gameName: 'Game Name', tagLine: 'LAS' });
  assert.deepEqual(parseRiotId('  Ñandú#1234 '), { gameName: 'Ñandú', tagLine: '1234' });
  for (const bad of ['', 'NoTag', '#TAG', 'Name#', 'A#B#C', 'Name#TOOLONG', 'Name#ta g', `${'x'.repeat(17)}#TAG`]) {
    assert.throws(() => parseRiotId(bad), CliError, bad);
  }
});

test('parses CLI options', () => {
  assert.deepEqual(parseArgs(['Name#TAG', '--region', 'Americas']), {
    riotId: { gameName: 'Name', tagLine: 'TAG' }, region: 'americas', count: 5, queue: null, timeline: null, raw: false, help: false,
  });
  const listing = parseArgs(['--region=sea', 'Name#TAG', '--count', '10', '--queue', '2400', '--raw']);
  assert.equal(listing.region, 'sea');
  assert.equal(listing.count, 10);
  assert.equal(listing.queue, 2400);
  assert.equal(listing.raw, true);
  assert.equal(parseArgs(['Name#TAG', '--region', 'americas', '--timeline', 'LA2_123']).timeline, 'LA2_123');
  assert.equal(parseArgs(['--help']).help, true);
});

test('rejects invalid CLI options', () => {
  const invalid = [
    ['Name#TAG'],
    ['Name#TAG', '--region', 'na1'],
    ['Name#TAG', '--region'],
    ['--region', 'americas'],
    ['A#B', 'C#D', '--region', 'americas'],
    ['Name#TAG', '--region', 'americas', '--count', '0'],
    ['Name#TAG', '--region', 'americas', '--count', '21'],
    ['Name#TAG', '--region', 'americas', '--count', '2.5'],
    ['Name#TAG', '--region', 'americas', '--queue', '-1'],
    ['Name#TAG', '--region', 'americas', '--timeline', '../../riot/account'],
    ['Name#TAG', '--region', 'americas', '--timeline', 'LA2_1', '--count', '3'],
    ['Name#TAG', '--region', 'americas', '--verbose'],
  ];
  for (const argv of invalid) assert.throws(() => parseArgs(argv), CliError, argv.join(' '));
});

test('routes Account-V1 through clusters that serve it', () => {
  assert.equal(accountRegion('americas'), 'americas');
  assert.equal(accountRegion('europe'), 'europe');
  assert.equal(accountRegion('asia'), 'asia');
  assert.equal(accountRegion('sea'), 'asia');
});

test('builds encoded request paths', () => {
  assert.equal(accountPath({ gameName: 'Game Name', tagLine: 'LAS' }), '/riot/account/v1/accounts/by-riot-id/Game%20Name/LAS');
  assert.equal(matchIdsPath('a/b', { count: 5, queue: null }), '/lol/match/v5/matches/by-puuid/a%2Fb/ids?start=0&count=5');
  assert.equal(matchIdsPath('p', { count: 3, queue: 2400 }), '/lol/match/v5/matches/by-puuid/p/ids?start=0&count=3&queue=2400');
});

test('requires RIOT_API_KEY without echoing it', () => {
  assert.throws(() => readApiKey({}), CliError);
  assert.throws(() => readApiKey({ RIOT_API_KEY: '   ' }), CliError);
  assert.throws(() => readApiKey({ RIOT_API_KEY: 'a b' }), error => !error.message.includes('a b'));
  assert.equal(readApiKey({ RIOT_API_KEY: ` ${FAKE_KEY}\n` }), FAKE_KEY);
  assert.equal(redact(`oops ${FAKE_KEY} oops`, FAKE_KEY), 'oops [REDACTED] oops');
});

test('formats Riot HTTP errors safely', () => {
  const none = new Headers();
  assert.match(describeHttpError(401, none, 'x'), /authentication failed.*may have expired/);
  assert.match(describeHttpError(403, none, 'x'), /403 Forbidden.*expired.*or Riot does not expose this resource/);
  assert.match(describeHttpError(404, none, 'x'), /Not found/);
  const limited = describeHttpError(429, new Headers({ 'Retry-After': '17', 'X-Rate-Limit-Type': 'application' }), 'x');
  assert.match(limited, /429, application limit/);
  assert.match(limited, /Wait 17 seconds/);
  assert.match(limited, /No automatic retry/);
  assert.match(describeHttpError(503, none, 'x'), /service error \(503\)/);
});

test('client sends the key only as a header and never retries', async () => {
  const calls = [];
  const get = createRiotClient({ apiKey: FAKE_KEY, fetch: async (url, init) => { calls.push({ url, init }); return response(429, {}, { 'Retry-After': '5' }); } });
  await assert.rejects(get('americas', '/path', 'testing'), error => error instanceof RiotApiError && error.status === 429 && !error.message.includes(FAKE_KEY));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://americas.api.riotgames.com/path');
  assert.ok(!calls[0].url.includes(FAKE_KEY));
  assert.equal(calls[0].init.headers['X-Riot-Token'], FAKE_KEY);

  const offline = createRiotClient({ apiKey: FAKE_KEY, fetch: async () => { throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }); } });
  await assert.rejects(offline('europe', '/path', 'testing'), /Network error while testing: could not reach europe\.api\.riotgames\.com \(ENOTFOUND\)/);
});

const match = {
  metadata: { matchId: 'XX1_1', participants: ['other', PUUID] },
  info: {
    gameCreation: 1000, gameDuration: 900, gameEndTimestamp: 2000, queueId: 1, mapId: 12, gameMode: 'MODE', gameType: 'TYPE', someNewField: 'x',
    participants: [
      { puuid: 'other', participantId: 1, championName: 'Other' },
      { puuid: PUUID, participantId: 2, championId: 84, championName: 'Akali', summoner1Id: 4, summoner2Id: 6, win: false,
        item0: 3006, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 3340, playerAugment1: 7, kills: 3 },
    ],
    teams: [],
  },
};

test('finds the inspected participant and reports unknown match fields', () => {
  assert.equal(findParticipant(match, PUUID).championName, 'Akali');
  assert.equal(findParticipant(match, 'missing'), null);
  const summary = summarizeMatch(match, PUUID);
  assert.equal(summary.fields.queueId, 1);
  assert.deepEqual(summary.otherFields, { someNewField: 'x' });
  assert.equal(summary.player.playerAugment1, 7);
  assert.equal(summary.player.kills, undefined);
});

const timeline = {
  metadata: { participants: ['other', PUUID] },
  info: {
    frameInterval: 60000,
    participants: [{ participantId: 1, puuid: 'other' }, { participantId: 2, puuid: PUUID }],
    frames: [
      { events: [{ type: 'ITEM_PURCHASED', timestamp: 5000, participantId: 2, itemId: 1036 }, { type: 'ITEM_PURCHASED', timestamp: 4000, participantId: 1, itemId: 1001 }] },
      { events: [
        { type: 'ITEM_UNDO', timestamp: 65000, participantId: 2, beforeId: 1036, afterId: 0, goldGain: 350 },
        { type: 'CHAMPION_KILL', timestamp: 66000, killerId: 2 },
        { type: 'ITEM_SOLD', timestamp: 61000, participantId: 2, itemId: 1042 },
        { type: 'LEVEL_UP', timestamp: 61000, participantId: 2, level: 2 },
      ] },
    ],
  },
};

test('resolves the timeline participant by PUUID', () => {
  assert.equal(findTimelineParticipantId(timeline, PUUID), 2);
  assert.equal(findTimelineParticipantId({ metadata: timeline.metadata, info: {} }, PUUID), 2);
  assert.equal(findTimelineParticipantId(timeline, 'missing'), null);
});

test('filters item events for one participant in chronological order', () => {
  const events = itemEvents(timeline, 2);
  assert.deepEqual(events.map(event => event.type), ['ITEM_PURCHASED', 'ITEM_SOLD', 'ITEM_UNDO']);
  assert.deepEqual(events.map(event => event.timestamp), [5000, 61000, 65000]);
  assert.deepEqual(countEventTypes(events), { ITEM_PURCHASED: 1, ITEM_SOLD: 1, ITEM_UNDO: 1 });
});

test('formats only fields Riot provided', () => {
  assert.equal(formatTimestamp(261000), '04:21');
  assert.equal(formatTimestamp(undefined), '--:--');
  const names = new Map([['1036', 'Long Sword']]);
  assert.equal(formatEvent({ type: 'ITEM_PURCHASED', timestamp: 261000, participantId: 2, itemId: 1036 }, names), '[04:21] ITEM_PURCHASED   itemId=1036 (Long Sword)');
  const undo = formatEvent({ type: 'ITEM_UNDO', timestamp: 0, participantId: 2, beforeId: 9999, afterId: 0, goldGain: 1 }, names);
  assert.equal(undo, '[00:00] ITEM_UNDO        beforeId=9999 (not in local Data Dragon snapshot) afterId=0 goldGain=1');
  assert.ok(!undo.includes('itemId'));
});

function fakeRiot(routes) {
  const calls = [];
  const fetch = async url => {
    calls.push(url);
    const path = new URL(url).pathname;
    const route = Object.entries(routes).find(([prefix]) => path === prefix);
    return route ? response(200, route[1]) : response(404, {});
  };
  return { fetch, calls };
}

async function run(argv, env, fetch) {
  const out = [];
  const err = [];
  const code = await main({ argv, env, fetch, stdout: line => out.push(line), stderr: line => err.push(line), itemNames: null });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

test('fails before any network request when RIOT_API_KEY is missing', async () => {
  let called = false;
  const result = await run(['Name#TAG', '--region', 'americas'], {}, async () => { called = true; });
  assert.equal(result.code, 1);
  assert.equal(called, false);
  assert.match(result.err, /RIOT_API_KEY is not set/);
});

test('lists matches through mocked Riot routes without leaking the key', async () => {
  const { fetch, calls } = fakeRiot({
    '/riot/account/v1/accounts/by-riot-id/Name/TAG': { puuid: PUUID, gameName: 'Name', tagLine: 'TAG' },
    [`/lol/match/v5/matches/by-puuid/${PUUID}/ids`]: ['XX1_1'],
    '/lol/match/v5/matches/XX1_1': match,
    '/lol/match/v5/matches/XX1_1/timeline': timeline,
  });
  const listed = await run(['Name#TAG', '--region', 'sea'], { RIOT_API_KEY: FAKE_KEY }, fetch);
  assert.equal(listed.code, 0, listed.err);
  assert.match(calls[0], /^https:\/\/asia\.api\.riotgames\.com\//);
  assert.match(calls[1], /^https:\/\/sea\.api\.riotgames\.com\//);
  assert.match(listed.out, /championName=Akali/);
  assert.match(listed.out, /other info fields: someNewField="x"/);
  assert.ok(!listed.out.includes(PUUID), 'Full PUUID is not printed');

  const inspected = await run(['Name#TAG', '--region', 'americas', '--timeline', 'XX1_1', '--raw'], { RIOT_API_KEY: FAKE_KEY }, fetch);
  assert.equal(inspected.code, 0, inspected.err);
  assert.match(inspected.out, /\[00:05\] ITEM_PURCHASED +itemId=1036\n.*\[01:01\] ITEM_SOLD +itemId=1042\n.*\[01:05\] ITEM_UNDO/);
  assert.ok(!inspected.out.includes('"championName": "Other"'), 'Raw output excludes other participants');
  for (const text of [listed.out, listed.err, inspected.out, inspected.err]) assert.ok(!text.includes(FAKE_KEY));

  const failed = await run(['Name#TAG', '--region', 'americas', '--timeline', 'XX1_404'], { RIOT_API_KEY: FAKE_KEY }, fetch);
  assert.equal(failed.code, 1);
  assert.match(failed.err, /Not found \(404\) while fetching match XX1_404/);
});

test('the shipped frontend never references the Riot key', () => {
  const sources = frontendSources(/\.(ts|tsx|js|json)$/);
  assert.ok(sources.length > 0);
  for (const { path, source } of sources) assert.ok(!/RIOT_API_KEY|RGAPI-|riot-inspect/.test(source), path);
});

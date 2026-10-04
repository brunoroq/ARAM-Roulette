// Development-only Riot API inspector. See docs/RIOT_API_EXPERIMENT.md.
// Nothing in src/ imports this file: it is never bundled by Vite or embedded by Tauri.
// The API key is read from process.env.RIOT_API_KEY at runtime and only sent as a request header.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REGIONS = ['americas', 'asia', 'europe', 'sea'];
export const DEFAULT_COUNT = 5;
export const MAX_COUNT = 20;

const USAGE = `Usage:
  npm run riot:inspect -- "GameName#TAG" --region <routing> [--count N] [--queue ID] [--raw]
  npm run riot:inspect -- "GameName#TAG" --region <routing> --timeline <MATCH_ID> [--raw]

  --region     Regional routing value: ${REGIONS.join(', ')} (required)
  --count      Recent matches to fetch, 1-${MAX_COUNT} (default ${DEFAULT_COUNT})
  --queue      Only list matches with this queueId
  --timeline   Print the item-related timeline events of one match
  --raw        Also print the relevant response fields as JSON

RIOT_API_KEY must be set in the environment. See docs/RIOT_API_EXPERIMENT.md.`;

export class CliError extends Error {}

export class RiotApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.status = status;
  }
}

// Account-V1 is served by americas, asia and europe only. Riot returns identical account
// data from every cluster, so SEA accounts are resolved through asia.
export const accountRegion = region => (region === 'sea' ? 'asia' : region);

export function parseRiotId(input) {
  const value = String(input ?? '').trim();
  const parts = value.split('#');
  if (parts.length !== 2) throw new CliError('Riot ID must have the form GameName#TAG.');
  const gameName = parts[0].trim();
  const tagLine = parts[1].trim();
  if (!gameName || [...gameName].length > 16) throw new CliError('Riot ID game name must be 1-16 characters.');
  if (!/^[\p{L}\p{N}]{1,5}$/u.test(tagLine)) throw new CliError('Riot ID tag must be 1-5 letters or digits.');
  return { gameName, tagLine };
}

export function parseArgs(argv) {
  const options = { riotId: null, region: null, count: DEFAULT_COUNT, queue: null, timeline: null, raw: false, help: false };
  const positional = [];
  let countGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--raw') { options.raw = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const [name, inline] = arg.split(/=(.*)/s, 2);
    const value = inline ?? argv[++i];
    if (value === undefined || value === '') throw new CliError(`${name} requires a value.`);
    if (name === '--region') options.region = value.toLowerCase();
    else if (name === '--count') { options.count = parseInteger(value, name, 1, MAX_COUNT); countGiven = true; }
    else if (name === '--queue') options.queue = parseInteger(value, name, 0, Number.MAX_SAFE_INTEGER);
    else if (name === '--timeline') options.timeline = value.trim();
    else throw new CliError(`Unknown option: ${name}`);
  }
  if (options.help) return options;
  if (positional.length !== 1) throw new CliError('Provide exactly one Riot ID, for example "GameName#TAG".');
  options.riotId = parseRiotId(positional[0]);
  if (!options.region) throw new CliError(`--region is required (${REGIONS.join(', ')}).`);
  if (!REGIONS.includes(options.region)) throw new CliError(`Unknown region "${options.region}". Use one of: ${REGIONS.join(', ')}.`);
  if (options.timeline !== null) {
    if (!/^[A-Za-z0-9]+_\d+$/.test(options.timeline)) throw new CliError('Match ID must look like PLATFORM_NUMBER, for example LA2_1234567890.');
    if (countGiven || options.queue !== null) throw new CliError('--count and --queue only apply when listing recent matches.');
  }
  return options;
}

function parseInteger(value, name, min, max) {
  if (!/^\d+$/.test(value)) throw new CliError(`${name} must be a whole number.`);
  const number = Number(value);
  if (number < min || number > max) throw new CliError(`${name} must be between ${min} and ${max}.`);
  return number;
}

export function readApiKey(env) {
  const key = env.RIOT_API_KEY?.trim();
  if (!key) throw new CliError('RIOT_API_KEY is not set. Export your Riot development API key in this shell first (see docs/RIOT_API_EXPERIMENT.md).');
  if (/\s/.test(key)) throw new CliError('RIOT_API_KEY contains whitespace. Set it again without spaces or line breaks.');
  return key;
}

// Defense in depth: the key is never put into messages, but scrub it from anything printed.
export function redact(text, key) {
  const value = String(text);
  return key ? value.split(key).join('[REDACTED]') : value;
}

export function describeHttpError(status, headers, context) {
  if (status === 401) {
    return `Riot API authentication failed (401) while ${context}. The development API key may have expired or be invalid. `
      + 'Regenerate it at https://developer.riotgames.com and set RIOT_API_KEY again.';
  }
  // Riot also answers 403 for data it deliberately withholds (Brawl, ARAM: Mayhem), so an expired key is only one possibility.
  if (status === 403) {
    return `Riot API returned 403 Forbidden while ${context}. Either the development API key has expired or is invalid, `
      + 'or Riot does not expose this resource. If other requests with the same key succeed, it is the latter.';
  }
  if (status === 404) return `Not found (404) while ${context}. Check the Riot ID, the --region routing value and the match ID.`;
  if (status === 429) {
    const retryAfter = headers.get('retry-after');
    const limitType = headers.get('x-rate-limit-type');
    return `Rate limited by Riot (429${limitType ? `, ${limitType} limit` : ''}) while ${context}. `
      + `${retryAfter ? `Wait ${retryAfter} seconds` : 'Wait a while'} before running the inspector again. No automatic retry was attempted.`;
  }
  if (status === 400) return `Riot API rejected the request (400) while ${context}.`;
  if (status >= 500) return `Riot API service error (${status}) while ${context}. Try again later.`;
  return `Unexpected Riot API response (${status}) while ${context}.`;
}

export function createRiotClient({ apiKey, fetch = globalThis.fetch }) {
  return async function get(region, path, context) {
    const host = `${region}.api.riotgames.com`;
    let response;
    try {
      response = await fetch(`https://${host}${path}`, { headers: { 'X-Riot-Token': apiKey, Accept: 'application/json' } });
    } catch (error) {
      const code = error?.cause?.code ? ` (${error.cause.code})` : '';
      throw new RiotApiError(`Network error while ${context}: could not reach ${host}${code}.`);
    }
    if (!response.ok) throw new RiotApiError(describeHttpError(response.status, response.headers, context), response.status);
    try {
      return await response.json();
    } catch {
      throw new RiotApiError(`Riot API returned invalid JSON while ${context}.`, response.status);
    }
  };
}

const segment = value => encodeURIComponent(value);

export const accountPath = ({ gameName, tagLine }) => `/riot/account/v1/accounts/by-riot-id/${segment(gameName)}/${segment(tagLine)}`;

export function matchIdsPath(puuid, { count, queue }) {
  const query = new URLSearchParams({ start: '0', count: String(count) });
  if (queue !== null && queue !== undefined) query.set('queue', String(queue));
  return `/lol/match/v5/matches/by-puuid/${segment(puuid)}/ids?${query}`;
}

export const matchPath = matchId => `/lol/match/v5/matches/${segment(matchId)}`;
export const timelinePath = matchId => `/lol/match/v5/matches/${segment(matchId)}/timeline`;

export const findParticipant = (match, puuid) => match?.info?.participants?.find(participant => participant.puuid === puuid) ?? null;

// Timelines list { participantId, puuid } in info.participants; metadata.participants is ordered by participantId.
export function findTimelineParticipantId(timeline, puuid) {
  const entry = timeline?.info?.participants?.find(participant => participant.puuid === puuid);
  if (entry) return entry.participantId;
  const index = timeline?.metadata?.participants?.indexOf(puuid) ?? -1;
  return index >= 0 ? index + 1 : null;
}

const KNOWN_INFO_FIELDS = ['gameCreation', 'gameStartTimestamp', 'gameEndTimestamp', 'gameDuration', 'queueId', 'mapId', 'gameMode', 'gameType', 'gameVersion', 'platformId', 'endOfGameResult'];
const NESTED_INFO_FIELDS = new Set(['participants', 'teams']);
const ITEM_SLOTS = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6'];

// Fields beyond the documented basics are reported as-is: they may be what distinguishes Mayhem.
export function summarizeMatch(match, puuid) {
  const info = match?.info ?? {};
  const fields = {};
  for (const key of KNOWN_INFO_FIELDS) if (key in info) fields[key] = info[key];
  const otherFields = {};
  for (const [key, value] of Object.entries(info)) {
    if (KNOWN_INFO_FIELDS.includes(key) || NESTED_INFO_FIELDS.has(key)) continue;
    otherFields[key] = value;
  }
  const participant = findParticipant(match, puuid);
  let player = null;
  if (participant) {
    player = {};
    for (const key of ['participantId', 'championId', 'championName', 'summoner1Id', 'summoner2Id', 'win', ...ITEM_SLOTS]) {
      if (key in participant) player[key] = participant[key];
    }
    for (const key of Object.keys(participant)) if (/augment/i.test(key)) player[key] = participant[key];
  }
  return { matchId: match?.metadata?.matchId ?? null, fields, otherFields, player };
}

export function timelineEvents(timeline) {
  return (timeline?.info?.frames ?? []).flatMap(frame => frame.events ?? []);
}

// Stable sort: events sharing a timestamp keep Riot's order.
export function itemEvents(timeline, participantId) {
  return timelineEvents(timeline)
    .filter(event => event.participantId === participantId && typeof event.type === 'string' && event.type.startsWith('ITEM_'))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

export function participantEvents(timeline, participantId) {
  return timelineEvents(timeline)
    .filter(event => event.participantId === participantId)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

export function countEventTypes(events) {
  const counts = {};
  for (const event of events) counts[event.type ?? '(no type)'] = (counts[event.type ?? '(no type)'] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function formatTimestamp(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '--:--';
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const ITEM_FIELDS = ['itemId', 'beforeId', 'afterId'];

function itemLabel(id, itemNames) {
  if (!itemNames || id === 0) return String(id);
  const name = itemNames.get(String(id));
  return name ? `${id} (${name})` : `${id} (not in local Data Dragon snapshot)`;
}

// Prints only fields present on the event; unrecognised fields are appended verbatim.
export function formatEvent(event, itemNames) {
  const parts = [`[${formatTimestamp(event.timestamp)}]`, String(event.type ?? '(no type)').padEnd(16)];
  for (const key of ITEM_FIELDS) if (key in event) parts.push(`${key}=${itemLabel(event[key], itemNames)}`);
  for (const [key, value] of Object.entries(event)) {
    if (['type', 'timestamp', 'participantId', ...ITEM_FIELDS].includes(key)) continue;
    parts.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }
  return parts.join(' ');
}

function formatTime(ms) {
  return typeof ms === 'number' ? `${new Date(ms).toISOString()} (${ms})` : 'not reported';
}

// Riot reports gameDuration in seconds when gameEndTimestamp exists, otherwise in milliseconds.
function formatDuration(fields) {
  if (typeof fields.gameDuration !== 'number') return 'not reported';
  const seconds = 'gameEndTimestamp' in fields ? fields.gameDuration : Math.floor(fields.gameDuration / 1000);
  return `${formatTimestamp(seconds * 1000)} (raw gameDuration=${fields.gameDuration})`;
}

export function formatMatchSummary(summary, itemNames) {
  const { fields, otherFields, player } = summary;
  const show = key => (key in fields ? JSON.stringify(fields[key]) : 'not reported');
  const lines = [
    `Match ${summary.matchId ?? '(no matchId)'}`,
    `  created:   ${formatTime(fields.gameCreation)}`,
    `  started:   ${formatTime(fields.gameStartTimestamp)}`,
    `  ended:     ${formatTime(fields.gameEndTimestamp)}`,
    `  duration:  ${formatDuration(fields)}`,
    `  queueId=${show('queueId')} mapId=${show('mapId')} gameMode=${show('gameMode')} gameType=${show('gameType')}`,
    `  gameVersion=${show('gameVersion')} platformId=${show('platformId')} endOfGameResult=${show('endOfGameResult')}`,
  ];
  const others = Object.entries(otherFields);
  if (others.length) lines.push(`  other info fields: ${others.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ')}`);
  if (!player) {
    lines.push('  player: PUUID not found among participants');
    return lines.join('\n');
  }
  lines.push(
    `  player:    participantId=${player.participantId ?? '?'} championId=${player.championId ?? '?'} championName=${player.championName ?? '?'} win=${player.win ?? '?'}`,
    `  spells:    summoner1Id=${player.summoner1Id ?? '?'} summoner2Id=${player.summoner2Id ?? '?'}`,
    `  items:     ${ITEM_SLOTS.map(slot => `${slot}=${slot in player ? itemLabel(player[slot], itemNames) : '?'}`).join(' ')}`,
  );
  const augments = Object.entries(player).filter(([key]) => /augment/i.test(key));
  if (augments.length) lines.push(`  augments:  ${augments.map(([key, value]) => `${key}=${value}`).join(' ')}`);
  return lines.join('\n');
}

export function loadItemNames(root = fileURLToPath(new URL('../', import.meta.url))) {
  try {
    const { data } = JSON.parse(readFileSync(resolve(root, 'src/data/raw/item.json'), 'utf8'));
    return new Map(Object.entries(data).map(([id, item]) => [id, item.name]));
  } catch {
    return null;
  }
}

const shortPuuid = puuid => `${String(puuid).slice(0, 8)}…`;

// Raw output excludes other players: only match-level fields and the inspected participant.
function rawMatch(match, puuid) {
  const { participants: _participants, teams: _teams, ...info } = match?.info ?? {};
  return { matchId: match?.metadata?.matchId, info, participant: findParticipant(match, puuid) };
}

export async function main({ argv, env, fetch = globalThis.fetch, stdout = console.log, stderr = console.error, itemNames = loadItemNames() }) {
  let apiKey = null;
  try {
    const options = parseArgs(argv);
    if (options.help) { stdout(USAGE); return 0; }
    apiKey = readApiKey(env);
    const get = createRiotClient({ apiKey, fetch });
    const { region } = options;

    const account = await get(accountRegion(region), accountPath(options.riotId), 'resolving the Riot account');
    if (!account?.puuid) throw new RiotApiError('Riot account response did not include a PUUID.');
    const { puuid } = account;
    stdout(`Account ${account.gameName ?? options.riotId.gameName}#${account.tagLine ?? options.riotId.tagLine} (PUUID ${shortPuuid(puuid)}), Match-V5 routing: ${region}`);

    if (options.timeline) {
      const matchId = options.timeline;
      const match = await get(region, matchPath(matchId), `fetching match ${matchId}`);
      stdout('');
      stdout(formatMatchSummary(summarizeMatch(match, puuid), itemNames));
      const timeline = await get(region, timelinePath(matchId), `fetching the timeline of ${matchId}`);
      const participantId = findTimelineParticipantId(timeline, puuid);
      stdout('');
      if (participantId === null) { stdout('PUUID not found among timeline participants.'); return 1; }
      const events = itemEvents(timeline, participantId);
      stdout(`Timeline participantId=${participantId}, frameInterval=${timeline?.info?.frameInterval ?? 'not reported'}, frames=${timeline?.info?.frames?.length ?? 0}`);
      stdout(`Item events (type starts with ITEM_) for this participant: ${events.length}`);
      for (const event of events) stdout(`  ${formatEvent(event, itemNames)}`);
      const own = participantEvents(timeline, participantId);
      stdout('');
      stdout(`Event types with participantId=${participantId}: ${JSON.stringify(countEventTypes(own))}`);
      stdout(`Event types in the whole timeline: ${JSON.stringify(countEventTypes(timelineEvents(timeline)))}`);
      if (options.raw) {
        stdout('');
        stdout(JSON.stringify({ match: rawMatch(match, puuid), participantId, events: own }, null, 2));
      }
      return 0;
    }

    const ids = await get(region, matchIdsPath(puuid, options), 'listing recent matches');
    if (!Array.isArray(ids)) throw new RiotApiError('Riot match list response was not an array.');
    stdout(`Recent match IDs (${ids.length}${options.queue !== null ? `, queue=${options.queue}` : ''}): ${ids.join(', ') || 'none'}`);
    // Sequential on purpose: a handful of deliberate requests, no bursts.
    for (const matchId of ids) {
      const match = await get(region, matchPath(matchId), `fetching match ${matchId}`);
      stdout('');
      stdout(formatMatchSummary(summarizeMatch(match, puuid), itemNames));
      if (options.raw) stdout(JSON.stringify(rawMatch(match, puuid), null, 2));
    }
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      stderr(redact(error.message, apiKey));
      if (!(error.message.startsWith('RIOT_API_KEY'))) stderr(`\n${USAGE}`);
    } else if (error instanceof RiotApiError) {
      stderr(redact(error.message, apiKey));
    } else {
      stderr(redact(`Unexpected error: ${error?.message ?? error}`, apiKey));
    }
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main({ argv: process.argv.slice(2), env: process.env });
}

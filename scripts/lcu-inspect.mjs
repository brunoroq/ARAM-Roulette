// Development-only, read-only League Client (LCU) inspector. See docs/RIOT_API_EXPERIMENT.md.
// Nothing in src/ imports this file: it is never bundled by Vite or embedded by Tauri.
// The LCU is not officially supported by Riot, and every endpoint below is community-known,
// not documented. Only GET requests to 127.0.0.1 are made. Credentials come from the
// client's lockfile at runtime and are never printed or stored.
import { readFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { countEventTypes, formatEvent, itemEvents, loadItemNames, redact } from './riot-inspect.mjs';

export const DEFAULT_COUNT = 5;
export const MAX_COUNT = 20;
export const WINDOWS_LOCKFILE = 'C:\\Riot Games\\League of Legends\\lockfile';
const REQUEST_TIMEOUT_MS = 5000;

// Riot's published root for the certificates the League clients serve on localhost:
// https://static.developer.riotgames.com/docs/lol/riotgames.pem
const RIOT_ROOT_CA = fileURLToPath(new URL('./riotgames.pem', import.meta.url));

export const ENDPOINTS = {
  currentSummoner: () => '/lol-summoner/v1/current-summoner',
  matchList: count => `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count}`,
  game: gameId => `/lol-match-history/v1/games/${gameId}`,
  timeline: gameId => `/lol-match-history/v1/game-timelines/${gameId}`,
  endOfGame: () => '/lol-end-of-game/v1/eog-stats-block',
};

const USAGE = `Usage (Windows, League Client running and signed in):
  npm run lcu:inspect                      Your recent games from the local client
  npm run lcu:inspect -- --latest          Details and timeline of your newest game
  npm run lcu:inspect -- --game-id <ID>    Details and timeline of one game

  --count      Recent games to list, 1-${MAX_COUNT} (default ${DEFAULT_COUNT})
  --lockfile   Path to the League Client lockfile (default ${WINDOWS_LOCKFILE})
  --raw        Also print your own sanitized records as JSON

Read-only. See docs/RIOT_API_EXPERIMENT.md.`;

export class CliError extends Error {}
export class LcuError extends Error {}

export function parseArgs(argv) {
  const options = { latest: false, gameId: null, count: DEFAULT_COUNT, lockfile: null, raw: false, help: false };
  let countGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--raw') { options.raw = true; continue; }
    if (arg === '--latest') { options.latest = true; continue; }
    if (!arg.startsWith('--')) throw new CliError(`Unexpected argument: ${arg}`);
    const [name, inline] = arg.split(/=(.*)/s, 2);
    const value = inline ?? argv[++i];
    if (value === undefined || value === '') throw new CliError(`${name} requires a value.`);
    if (name === '--game-id') options.gameId = parseGameId(value);
    else if (name === '--lockfile') options.lockfile = value;
    else if (name === '--count') {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > MAX_COUNT) throw new CliError(`--count must be between 1 and ${MAX_COUNT}.`);
      options.count = Number(value);
      countGiven = true;
    } else throw new CliError(`Unknown option: ${name}`);
  }
  if (options.latest && options.gameId !== null) throw new CliError('Use either --latest or --game-id, not both.');
  if (countGiven && (options.latest || options.gameId !== null)) throw new CliError('--count only applies when listing recent games.');
  return options;
}

// The client uses numeric game IDs; a Match-V5 style "LA2_123" is accepted for convenience.
export function parseGameId(value) {
  const match = /^(?:[A-Za-z0-9]+_)?(\d{1,20})$/.exec(value.trim());
  if (!match) throw new CliError('--game-id must be a numeric game ID, for example 1234567890.');
  return match[1];
}

// Lockfile format: "<process name>:<pid>:<port>:<password>:<protocol>".
export function parseLockfile(text) {
  const parts = String(text).trim().split(':');
  if (parts.length !== 5) throw new LcuError('League Client lockfile has an unexpected format.');
  const [, pid, port, password, protocol] = parts;
  const portNumber = Number(port);
  if (!/^\d+$/.test(port) || portNumber < 1 || portNumber > 65535) throw new LcuError('League Client lockfile has an invalid port.');
  if (!password) throw new LcuError('League Client lockfile has no password.');
  if (protocol !== 'https') throw new LcuError(`League Client lockfile names an unsupported protocol (${protocol}).`);
  return { pid: Number(pid), port: portNumber, password };
}

export function describeConnectionError(error) {
  const code = error?.code ?? '';
  if (code === 'ECONNREFUSED') return 'Could not connect to the League Client (ECONNREFUSED). It may not be running, or the lockfile is stale.';
  if (code === 'ETIMEDOUT' || /timed out/.test(error?.message ?? '')) return 'The League Client did not answer in time.';
  if (/CERT|SELF_SIGNED|SIGNATURE|ALTNAME/.test(code)) {
    return `TLS verification against Riot's root certificate failed (${code}). Not continuing over an unverified connection.`;
  }
  return `Could not reach the League Client${code ? ` (${code})` : ''}.`;
}

// GET only, loopback only. Resolves { status, body }; body is undefined when not JSON.
export function createLcuClient({ port, password, ca = readFileSync(RIOT_ROOT_CA), request = httpsRequest }) {
  const authorization = `Basic ${Buffer.from(`riot:${password}`).toString('base64')}`;
  return path => new Promise((resolvePromise, reject) => {
    const req = request({
      host: '127.0.0.1', port, path, method: 'GET', ca, timeout: REQUEST_TIMEOUT_MS,
      headers: { Authorization: authorization, Accept: 'application/json' },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = text ? JSON.parse(text) : null; } catch { body = undefined; }
        resolvePromise({ status: response.statusCode, body });
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', error => reject(new LcuError(describeConnectionError(error))));
    req.end();
  });
}

// The match-history list has been seen both as { games: { games: [...] } } and { games: [...] }.
export function gamesFromList(body) {
  const games = Array.isArray(body?.games) ? body.games : body?.games?.games;
  return Array.isArray(games) ? games : [];
}

export function newestGameId(games) {
  const newest = [...games].filter(game => game?.gameId != null)
    .sort((a, b) => (b.gameCreation ?? 0) - (a.gameCreation ?? 0))[0];
  return newest ? String(newest.gameId) : null;
}

// Match-V4 layout: participantIdentities[].player.puuid names a participantId. A flattened
// participant carrying its own puuid is accepted too. No positional guessing.
export function findOwnParticipant(game, puuid) {
  if (!puuid) return null;
  const participants = Array.isArray(game?.participants) ? game.participants : [];
  const identity = game?.participantIdentities?.find(entry => entry?.player?.puuid === puuid);
  if (identity) {
    const participant = participants.find(entry => entry?.participantId === identity.participantId);
    if (participant) return participant;
  }
  return participants.find(entry => entry?.puuid === puuid) ?? null;
}

const KNOWN_GAME_FIELDS = ['gameId', 'platformId', 'gameCreation', 'gameCreationDate', 'gameDuration', 'queueId', 'mapId', 'seasonId', 'gameVersion', 'gameMode', 'gameType'];
const PEOPLE_FIELDS = new Set(['participants', 'participantIdentities', 'teams']);
const ITEM_SLOTS = ['item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6'];

export function summarizeGame(game, puuid) {
  const fields = {};
  for (const key of KNOWN_GAME_FIELDS) if (game && key in game) fields[key] = game[key];
  const otherFields = {};
  const nestedFields = [];
  for (const [key, value] of Object.entries(game ?? {})) {
    if (KNOWN_GAME_FIELDS.includes(key) || PEOPLE_FIELDS.has(key)) continue;
    if (value !== null && typeof value === 'object') nestedFields.push(key);
    else otherFields[key] = value;
  }
  const participant = findOwnParticipant(game, puuid);
  let player = null;
  if (participant) {
    const stats = participant.stats ?? participant;
    player = { items: {}, augments: {} };
    for (const key of ['participantId', 'championId', 'teamId', 'spell1Id', 'spell2Id']) {
      if (key in participant) player[key] = participant[key];
      else if (key in stats) player[key] = stats[key];
    }
    if ('win' in stats) player.win = stats.win;
    for (const slot of ITEM_SLOTS) if (slot in stats) player.items[slot] = stats[slot];
    for (const source of [participant, stats]) {
      for (const [key, value] of Object.entries(source)) if (/augment/i.test(key) && typeof value !== 'object') player.augments[key] = value;
    }
  }
  return { gameId: game?.gameId ?? null, fields, otherFields, nestedFields, player };
}

function itemLabel(id, itemNames) {
  if (!itemNames || id === 0 || typeof id !== 'number') return String(id);
  const name = itemNames.get(String(id));
  return name ? `${id} (${name})` : `${id} (not in local Data Dragon snapshot)`;
}

export function formatGameSummary(summary, itemNames) {
  const { fields, otherFields, nestedFields, player } = summary;
  const show = key => (key in fields ? JSON.stringify(fields[key]) : 'not reported');
  const lines = [`Game ${summary.gameId ?? '(no gameId)'}`];
  if ('gameCreation' in fields) lines.push(`  gameCreation:     ${typeof fields.gameCreation === 'number' ? `${new Date(fields.gameCreation).toISOString()} (${fields.gameCreation})` : JSON.stringify(fields.gameCreation)}`);
  if ('gameCreationDate' in fields) lines.push(`  gameCreationDate: ${JSON.stringify(fields.gameCreationDate)}`);
  if ('gameDuration' in fields) {
    const raw = fields.gameDuration;
    lines.push(`  gameDuration:     ${raw}${typeof raw === 'number' ? ` (${Math.floor(raw / 60)}:${String(raw % 60).padStart(2, '0')} if seconds)` : ''}`);
  }
  lines.push(
    `  queueId=${show('queueId')} mapId=${show('mapId')} gameMode=${show('gameMode')} gameType=${show('gameType')}`,
    `  gameVersion=${show('gameVersion')} platformId=${show('platformId')} seasonId=${show('seasonId')}`,
  );
  const others = Object.entries(otherFields);
  if (others.length) lines.push(`  other game fields: ${others.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(' ')}`);
  if (nestedFields.length) lines.push(`  nested game fields (not printed): ${nestedFields.join(', ')}`);
  if (!player) {
    lines.push('  player: your record was not found in this response');
    return lines.join('\n');
  }
  const value = key => (key in player ? JSON.stringify(player[key]) : 'not reported');
  lines.push(
    `  player:   participantId=${value('participantId')} championId=${value('championId')} teamId=${value('teamId')} win=${value('win')}`,
    `  spells:   spell1Id=${value('spell1Id')} spell2Id=${value('spell2Id')}`,
    `  items:    ${ITEM_SLOTS.map(slot => `${slot}=${slot in player.items ? itemLabel(player.items[slot], itemNames) : 'not reported'}`).join(' ')}`,
  );
  const augments = Object.entries(player.augments);
  lines.push(`  augments: ${augments.length ? augments.map(([key, id]) => `${key}=${id}`).join(' ') : 'no augment fields reported'}`);
  return lines.join('\n');
}

// LCU timelines have been seen with frames at the top level; a Match-V5 style info wrapper is accepted too.
export function timelineFrames(timeline) {
  const frames = (timeline?.info ?? timeline)?.frames;
  return Array.isArray(frames) ? frames : [];
}

const IDENTIFYING_KEY = /puuid|summonerId|accountId|gameName|tagLine|summonerName|riotId|playerId|profileIcon|^name$/i;

// Removes identifiers before anything is printed as JSON, at any depth.
export function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !IDENTIFYING_KEY.test(key)).map(([key, inner]) => [key, sanitize(inner)]));
}

// End-of-game block: only the local player's record, never teammates or opponents.
export function ownEndOfGameRecord(block, puuid) {
  if (block?.localPlayer && typeof block.localPlayer === 'object') return block.localPlayer;
  for (const team of Array.isArray(block?.teams) ? block.teams : []) {
    const found = (Array.isArray(team?.players) ? team.players : []).find(player => (puuid && player?.puuid === puuid) || player?.isLocalPlayer === true);
    if (found) return found;
  }
  return null;
}

function rawGame(game, participant) {
  const gameFields = Object.fromEntries(Object.entries(game ?? {}).filter(([key, value]) => !PEOPLE_FIELDS.has(key) && (value === null || typeof value !== 'object')));
  return sanitize({ game: gameFields, participant });
}

export async function main({
  argv, platform = process.platform, readFile = path => readFileSync(path, 'utf8'), createClient = createLcuClient,
  stdout = console.log, stderr = console.error, itemNames = loadItemNames(),
}) {
  let password = null;
  try {
    const options = parseArgs(argv);
    if (options.help) { stdout(USAGE); return 0; }
    const lockfilePath = options.lockfile ?? (platform === 'win32' ? WINDOWS_LOCKFILE : null);
    if (!lockfilePath) throw new CliError('Pass --lockfile <path>. The League Client runs on Windows; this inspector does not look for it elsewhere.');
    let lockfileText;
    try {
      lockfileText = readFile(lockfilePath);
    } catch {
      throw new LcuError(`League Client lockfile not found at ${lockfilePath}. Start the client and sign in, or pass --lockfile.`);
    }
    const lockfile = parseLockfile(lockfileText);
    password = lockfile.password;
    const request = createClient({ port: lockfile.port, password });

    const probes = [];
    const get = async path => {
      const result = await request(path);
      probes.push({ path, status: result.status, json: result.body !== undefined });
      return result;
    };

    const summoner = await get(ENDPOINTS.currentSummoner());
    if (summoner.status === 401 || summoner.status === 403) throw new LcuError(`The League Client rejected the lockfile credentials (${summoner.status}). Restart the client and try again.`);
    if (summoner.status !== 200 || !summoner.body?.puuid) throw new LcuError(`Current summoner unavailable (${summoner.status}). Sign in to the League Client first.`);
    const { puuid } = summoner.body;
    const riotId = summoner.body.gameName ? `${summoner.body.gameName}#${summoner.body.tagLine ?? '?'}` : '(Riot ID not reported)';
    stdout(`LCU connected on 127.0.0.1 (lockfile port). Signed in as ${riotId}.`);

    let gameId = options.gameId;
    if (gameId === null) {
      const list = await get(ENDPOINTS.matchList(options.latest ? DEFAULT_COUNT : options.count));
      const games = list.status === 200 ? gamesFromList(list.body) : [];
      if (options.latest) {
        gameId = newestGameId(games);
        if (!gameId) throw new LcuError(`No games returned by the local match history (status ${list.status}).`);
        stdout(`Newest game in local match history: ${gameId}`);
      } else {
        stdout(`Local match history: ${games.length} game(s) (status ${list.status})`);
        for (const game of games.slice(0, options.count)) {
          stdout('');
          stdout(formatGameSummary(summarizeGame(game, puuid), itemNames));
          if (options.raw) stdout(JSON.stringify(rawGame(game, findOwnParticipant(game, puuid)), null, 2));
        }
      }
    }

    if (gameId !== null) {
      const details = await get(ENDPOINTS.game(gameId));
      stdout('');
      let participantId = null;
      if (details.status === 200 && details.body) {
        const summary = summarizeGame(details.body, puuid);
        participantId = summary.player?.participantId ?? null;
        stdout(formatGameSummary(summary, itemNames));
        if (options.raw) stdout(JSON.stringify(rawGame(details.body, findOwnParticipant(details.body, puuid)), null, 2));
      } else {
        stdout(`Game ${gameId}: details not available (status ${details.status}).`);
      }

      const timeline = await get(ENDPOINTS.timeline(gameId));
      stdout('');
      const frames = timeline.status === 200 ? timelineFrames(timeline.body) : [];
      if (timeline.status !== 200) stdout(`Timeline not available (status ${timeline.status}).`);
      else if (!frames.length) stdout('Timeline response has no frames.');
      else if (participantId === null) stdout(`Timeline has ${frames.length} frames, but your participantId is unknown, so no events are printed.`);
      else {
        const wrapped = { info: { frames } };
        const events = itemEvents(wrapped, participantId);
        const own = frames.flatMap(frame => frame.events ?? []).filter(event => event.participantId === participantId);
        stdout(`Timeline: ${frames.length} frames. Item events (type starts with ITEM_) for participantId=${participantId}: ${events.length}`);
        for (const event of events) stdout(`  ${formatEvent(event, itemNames)}`);
        stdout(`Event types with your participantId: ${JSON.stringify(countEventTypes(own))}`);
        stdout(`Event types in the whole timeline: ${JSON.stringify(countEventTypes(frames.flatMap(frame => frame.events ?? [])))}`);
        if (options.raw) stdout(JSON.stringify(sanitize(own), null, 2));
      }
    }

    const endOfGame = await get(ENDPOINTS.endOfGame());
    stdout('');
    if (endOfGame.status === 200 && endOfGame.body && typeof endOfGame.body === 'object') {
      const own = ownEndOfGameRecord(endOfGame.body, puuid);
      stdout(`End-of-game block: gameId=${JSON.stringify(endOfGame.body.gameId ?? 'not reported')} top-level keys: ${Object.keys(endOfGame.body).join(', ')}`);
      stdout(own ? `  your record keys: ${Object.keys(own).join(', ')}` : '  your record was not found in this block');
      if (own && options.raw) stdout(JSON.stringify(sanitize(own), null, 2));
    } else {
      stdout(`End-of-game block not available (status ${endOfGame.status}). It is normally only present on the post-game screen.`);
    }

    stdout('');
    stdout('Endpoints requested (GET):');
    for (const probe of probes) stdout(`  ${String(probe.status).padEnd(4)} ${probe.path}${probe.json ? '' : ' (non-JSON body)'}`);
    return 0;
  } catch (error) {
    if (error instanceof CliError) stderr(`${redact(error.message, password)}\n\n${USAGE}`);
    else if (error instanceof LcuError) stderr(redact(error.message, password));
    else stderr(redact(`Unexpected error: ${error?.message ?? error}`, password));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main({ argv: process.argv.slice(2) });
}

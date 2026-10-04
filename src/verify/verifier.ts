import type {
  BuildStatus, LcuGame, LcuPlayer, LcuRead, LockedChallenge, Outcome, PendingReason, UnverifiableReason, VerificationData,
} from './types.ts';

// Local, post-game verification of the signed-in player's own ARAM: Mayhem game.
// Mayhem timelines carry no item events, so purchase order is never checked or implied:
// only champion, spells, final-inventory compatibility and the result.
// See docs/CHALLENGE_VERIFICATION.md before extending this.

export const MAYHEM_QUEUE_ID = 2400;
/** item6 is the trinket slot (Poro-Snax in ARAM); build items cannot go there. */
const TRINKET_SLOT = 6;
const MAX_RECIPE_DEPTH = 8;

/**
 * Augment ID → item IDs that augment is confirmed to grant or transform into.
 * Empty until confirmed from real games: never guessed. Listed items are ignored
 * only when the player actually took that augment.
 */
export const AUGMENT_ITEM_EXCEPTIONS: Readonly<Record<number, readonly string[]>> = {};

export type BuildCheck =
  | { readonly status: 'compatible'; readonly completedItemIds: readonly string[] }
  | { readonly status: 'mismatch'; readonly itemIds: readonly string[] }
  | { readonly status: 'unsupported'; readonly itemIds: readonly string[] };

interface RecipeNode { readonly id: string; readonly key: string }

/** Every recipe position below each target (the targets themselves excluded), keyed by tree path. */
function recipeNodes(targets: readonly string[], data: VerificationData): RecipeNode[] {
  const nodes: RecipeNode[] = [];
  const expand = (id: string, key: string, ancestors: ReadonlySet<string>) => {
    if (ancestors.size > MAX_RECIPE_DEPTH) return;
    for (const [index, child] of (data.items[id]?.from ?? []).entries()) {
      if (ancestors.has(child)) continue;
      const childKey = `${key}.${index}`;
      nodes.push({ id: child, key: childKey });
      expand(child, childKey, new Set(ancestors).add(child));
    }
  };
  targets.forEach((target, index) => expand(target, String(index), new Set([target])));
  return nodes;
}

const related = (a: string, b: string) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * Components still held must fit inside the recipes of unfinished targets: each one takes a
 * distinct recipe position, and no two held items may overlap in the same branch (a Serrated
 * Dirk already contains its Long Swords). Returns the components that cannot be explained.
 */
export function unexplainedComponents(components: readonly string[], unfinished: readonly string[], data: VerificationData): string[] {
  const nodes = recipeNodes(unfinished, data);
  const orphans = components.filter(id => !nodes.some(node => node.id === id));
  if (orphans.length) return orphans;
  const sorted = [...components].sort();
  const used: string[] = [];
  const place = (index: number): boolean => {
    if (index === sorted.length) return true;
    for (const node of nodes) {
      if (node.id !== sorted[index] || used.some(key => related(key, node.key))) continue;
      used.push(node.key);
      if (place(index + 1)) return true;
      used.pop();
    }
    return false;
  };
  return place(0) ? [] : sorted;
}

/**
 * Final-inventory compatibility. Slot order and purchase order are irrelevant; the build
 * need not be finished. A normal shop item outside the challenge is a mismatch. An item the
 * data cannot explain (unknown, special, duplicated) is unsupported rather than a failure.
 */
export function checkBuild(
  targets: readonly string[], inventory: readonly number[], augments: readonly number[],
  data: VerificationData, exceptions: Readonly<Record<number, readonly string[]>> = AUGMENT_ITEM_EXCEPTIONS,
): BuildCheck {
  const targetIds = new Set(targets);
  const granted = new Set(augments.flatMap(augment => exceptions[augment] ?? []));
  const completed = new Set<string>();
  const components: string[] = [];
  const unsupported: string[] = [];
  for (const id of inventory.slice(0, TRINKET_SLOT).filter(value => value > 0).map(String)) {
    const facts = data.items[id];
    const completes = targetIds.has(id) ? id : facts?.transformsFrom && targetIds.has(facts.transformsFrom) ? facts.transformsFrom : null;
    if (completes) {
      // The shop never sells a second copy of a completed pool item.
      if (completed.has(completes)) unsupported.push(id);
      else completed.add(completes);
    } else if (granted.has(id) || facts?.kind === 'auxiliary') {
      continue;
    } else if (!facts || facts.kind === 'special') {
      unsupported.push(id);
    } else {
      components.push(id);
    }
  }
  const mismatched = unexplainedComponents(components, targets.filter(id => !completed.has(id)), data);
  if (mismatched.length) return { status: 'mismatch', itemIds: mismatched };
  if (unsupported.length) return { status: 'unsupported', itemIds: unsupported };
  return { status: 'compatible', completedItemIds: targets.filter(id => completed.has(id)) };
}

/**
 * The client reports spell1Id/spell2Id, but neither Riot nor the client documents that they are
 * the D and F keys, so the locked pair is compared unordered.
 */
export function spellsMatch(challenge: LockedChallenge, player: LcuPlayer): boolean {
  const locked = [challenge.spellD, challenge.spellF].sort((a, b) => a - b);
  const actual = [player.spell1Id, player.spell2Id].sort((a, b) => a - b);
  return locked[0] === actual[0] && locked[1] === actual[1];
}

const readReasons: Record<Exclude<LcuRead['status'], 'ok'>, PendingReason> = {
  clientNotRunning: 'CLIENT_NOT_RUNNING', notSignedIn: 'NOT_SIGNED_IN', unavailable: 'LCU_UNAVAILABLE', desktopOnly: 'DESKTOP_ONLY',
};

/**
 * Finds the challenge game among Mayhem games created after the lock, skipping games already
 * counted. Other modes played in between are ignored. The earliest verifying game wins;
 * otherwise the earliest game with the locked champion explains why it could not verify.
 */
export function verifyChallenge(
  challenge: LockedChallenge, read: LcuRead, countedGameIds: ReadonlySet<number>, data: VerificationData, now: number,
  exceptions: Readonly<Record<number, readonly string[]>> = AUGMENT_ITEM_EXCEPTIONS,
): Outcome {
  if (read.status !== 'ok') return { kind: 'pending', reason: readReasons[read.status] };
  const mayhem = read.games
    .filter(game => game.queueId === MAYHEM_QUEUE_ID && game.gameCreation > challenge.lockedAt)
    .sort((a, b) => a.gameCreation - b.gameCreation);
  if (!mayhem.length) return { kind: 'pending', reason: 'NO_MAYHEM_GAME' };
  const fresh = mayhem.filter(game => !countedGameIds.has(game.gameId));
  if (!fresh.length) return { kind: 'pending', reason: 'ALREADY_COUNTED' };
  const readable = fresh.filter((game): game is LcuGame & { player: LcuPlayer } => game.player !== null);
  if (!readable.length) return { kind: 'pending', reason: 'INCOMPLETE_DATA' };
  const candidates = readable.filter(game => game.player.championId === challenge.championKey);
  if (!candidates.length) return { kind: 'pending', reason: 'CHAMPION_DIFFERS' };

  const evaluated = candidates.map(game => {
    const spells = spellsMatch(challenge, game.player);
    const build = checkBuild(challenge.itemIds, game.player.items, game.player.augments, data, exceptions);
    return { game, spells, build };
  });
  const verified = evaluated.find(entry => entry.spells && entry.build.status === 'compatible');
  if (verified && verified.build.status === 'compatible') {
    const { game } = verified;
    return {
      kind: 'verified',
      run: {
        challengeId: challenge.id, lockedAt: challenge.lockedAt, gameId: game.gameId, gameCreation: game.gameCreation, verifiedAt: now,
        championId: challenge.championId, championKey: game.player.championId,
        lockedSpellIds: [challenge.spellD, challenge.spellF], actualSpellIds: [game.player.spell1Id, game.player.spell2Id],
        challengeItemIds: [...challenge.itemIds], finalItemIds: game.player.items.slice(0, TRINKET_SLOT),
        completedItemIds: verified.build.completedItemIds, win: game.player.win,
      },
    };
  }
  const { game, spells, build } = evaluated[0]!;
  const status: BuildStatus = build.status;
  const reason: UnverifiableReason = !spells ? 'SPELL_MISMATCH' : status === 'mismatch' ? 'BUILD_MISMATCH' : 'UNSUPPORTED_ITEM';
  const completed = build.status === 'compatible' ? build.completedItemIds.length : 0;
  return { kind: 'unverifiable', result: { gameId: game.gameId, reason, spellsMatch: spells, build: status, completed } };
}

const isInteger = (value: unknown): value is number => Number.isSafeInteger(value);

function parsePlayer(value: unknown): LcuPlayer | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const player = value as Record<string, unknown>;
  const { items, augments } = player;
  if (![player.championId, player.spell1Id, player.spell2Id].every(isInteger) || typeof player.win !== 'boolean') return undefined;
  if (!Array.isArray(items) || items.length !== 7 || !items.every(isInteger)) return undefined;
  if (!Array.isArray(augments) || !augments.every(isInteger)) return undefined;
  return {
    championId: player.championId as number, spell1Id: player.spell1Id as number, spell2Id: player.spell2Id as number,
    win: player.win, items: [...items], augments: [...augments],
  };
}

/** Strict validation of the native command's reply; anything unexpected reads as unavailable. */
export function parseLcuRead(value: unknown): LcuRead {
  const unavailable: LcuRead = { status: 'unavailable' };
  if (!value || typeof value !== 'object') return unavailable;
  const reply = value as Record<string, unknown>;
  if (reply.status === 'clientNotRunning' || reply.status === 'notSignedIn' || reply.status === 'unavailable') return { status: reply.status };
  if (reply.status !== 'ok' || !Array.isArray(reply.games)) return unavailable;
  const games: LcuGame[] = [];
  for (const entry of reply.games) {
    if (!entry || typeof entry !== 'object') return unavailable;
    const game = entry as Record<string, unknown>;
    const player = parsePlayer(game.player ?? null);
    if (![game.gameId, game.gameCreation, game.queueId].every(isInteger) || player === undefined) return unavailable;
    games.push({
      gameId: game.gameId as number, gameCreation: game.gameCreation as number, queueId: game.queueId as number,
      mapId: isInteger(game.mapId) ? game.mapId : null, gameMode: typeof game.gameMode === 'string' ? game.gameMode : null, player,
    });
  }
  return { status: 'ok', games };
}

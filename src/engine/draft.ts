import type { Champion, Draft, DraftRules, GameData, Item, RoundPool, SummonerSpell } from '../types/game.ts';
import { sample } from './random.ts';
import type { RandomSource } from './random.ts';
import { isBoots, validItemPool } from './itemPool.ts';

export interface DraftContext {
  readonly data: GameData;
  readonly rules: DraftRules;
  readonly random?: RandomSource;
}

export function generateSummonerSpells(context: DraftContext): [SummonerSpell, SummonerSpell] {
  const spells = [...new Map(context.data.spells.map(spell => [spell.id, spell])).values()];
  const [first, second] = sample(spells, 2, context.random);
  return [first, second];
}

/** Pool selection is driven by the configured sequence, never by the UI. */
export function getRoundPool(build: readonly Item[], rules: DraftRules): RoundPool {
  const pool = rules.rounds[build.length];
  if (!pool) throw new Error('No draft round remains.');
  return pool;
}

/** All selection policy lives here; a future weighted sampler can replace sample. */
export function generateItemChoices(champion: Champion, build: readonly Item[], context: DraftContext, exclude: readonly string[] = []): Item[] {
  const roundPool = getRoundPool(build, context.rules);
  const pool = validItemPool(context.data.items, champion, build)
    .filter(item => isBoots(item) === (roundPool === 'boots') && !exclude.includes(item.id));
  const unique = [...new Map(pool.map(item => [item.id, item])).values()];
  return sample(unique, 2, context.random);
}

export function createDraft(champion: Champion, context: DraftContext): Draft {
  if (context.rules.rounds.length !== 6 || context.rules.rounds.filter(pool => pool === 'boots').length !== 1) {
    throw new Error('A draft must contain six rounds and exactly one boots round.');
  }
  if (!context.data.champions.some(c => c.id === champion.id)) throw new Error('Choose a champion from the roster.');
  return {
    champion, spells: generateSummonerSpells(context), spellKeys: ['D', 'F'], items: [],
    choices: generateItemChoices(champion, [], context),
    rerollsLeft: context.rules.rerolls, revision: 0, status: 'drafting',
  };
}

/** Revision rejects stale clicks, including double-clicks across consecutive rounds. */
export function selectItem(draft: Draft, itemId: string, revision: number, context: DraftContext): Draft {
  if (draft.status !== 'drafting' || draft.revision !== revision) return draft;
  const choice = draft.choices.find(item => item.id === itemId);
  if (!choice) return draft;
  const items = [...draft.items, choice];
  const complete = items.length === context.rules.rounds.length;
  return {
    ...draft, items, choices: complete ? [] : generateItemChoices(draft.champion, items, context),
    revision: draft.revision + 1, status: complete ? 'complete' : 'drafting',
  };
}

export function rerollItemChoices(draft: Draft, revision: number, context: DraftContext): Draft {
  if (draft.status !== 'drafting' || draft.rerollsLeft <= 0 || draft.revision !== revision) return draft;
  return {
    ...draft,
    choices: generateItemChoices(draft.champion, draft.items, context, draft.choices.map(item => item.id)),
    rerollsLeft: draft.rerollsLeft - 1, revision: draft.revision + 1,
  };
}

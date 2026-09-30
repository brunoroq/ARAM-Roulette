import type { Champion, Draft, DraftRules, GameData, Item, SlotPool, SummonerSpell } from '../types/game.ts';
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

function validateRules(rules: DraftRules): void {
  if (rules.slots.length !== 6 || rules.slots[1] !== 'boots' || rules.slots.some((pool, index) => pool !== (index === 1 ? 'boots' : 'standard'))) {
    throw new Error('A build must have six slots with boots only in slot two.');
  }
  if (rules.fullBuildRerolls !== 3 || rules.individualRerolls !== 3) throw new Error('A build must have three full-build and three individual rerolls.');
}

/** Uniform legal draw. The champion only applies existing purchase restrictions. */
export function generateItemForSlot(champion: Champion, pool: SlotPool, otherItems: readonly Item[], context: DraftContext, excludeId?: string): Item {
  const eligible = validItemPool(context.data.items, champion, otherItems)
    .filter(item => isBoots(item) === (pool === 'boots') && item.id !== excludeId);
  const unique = [...new Map(eligible.map(item => [item.id, item])).values()];
  return sample(unique, 1, context.random)[0];
}

export function createDraft(champion: Champion, context: DraftContext): Draft {
  validateRules(context.rules);
  if (!context.data.champions.some(c => c.id === champion.id)) throw new Error('Choose a champion from the roster.');
  return {
    champion, spells: generateSummonerSpells(context), spellKeys: ['D', 'F'], buildSlots: [],
    fullBuildRerollsLeft: context.rules.fullBuildRerolls,
    individualRerollsLeft: context.rules.individualRerolls,
    fullBuildRerollsLocked: false, revision: 0, status: 'spells',
  };
}

/** Draw a complete legal build without considering any previous build. */
function drawBuild(champion: Champion, context: DraftContext): Draft['buildSlots'] {
  const buildSlots: { pool: SlotPool; item: Item }[] = [];
  for (const pool of context.rules.slots) {
    const item = generateItemForSlot(champion, pool, buildSlots.map(slot => slot.item), context);
    buildSlots.push({ pool, item });
  }
  return buildSlots;
}

/** All six outcomes are fixed before the UI begins its decorative reveal. */
export function generateBuild(draft: Draft, context: DraftContext): Draft {
  if (draft.status !== 'spells') return draft;
  validateRules(context.rules);
  const buildSlots = drawBuild(draft.champion, context);
  return { ...draft, buildSlots, status: 'editing', revision: draft.revision + 1 };
}

export function rerollBuild(draft: Draft, revision: number, context: DraftContext): Draft {
  if (draft.status !== 'editing' || draft.fullBuildRerollsLocked || draft.fullBuildRerollsLeft <= 0 || draft.revision !== revision) return draft;
  validateRules(context.rules);
  return {
    ...draft, buildSlots: drawBuild(draft.champion, context),
    fullBuildRerollsLeft: draft.fullBuildRerollsLeft - 1, revision: draft.revision + 1,
  };
}

/** A replacement is chosen and committed in one engine transition. */
export function rerollSlot(draft: Draft, slotIndex: number, revision: number, context: DraftContext): Draft {
  if (draft.status !== 'editing' || draft.individualRerollsLeft <= 0 || draft.revision !== revision || !Number.isInteger(slotIndex)) return draft;
  const slot = draft.buildSlots[slotIndex];
  if (!slot) return draft;
  const otherItems = draft.buildSlots.filter((_, index) => index !== slotIndex).map(entry => entry.item);
  const item = generateItemForSlot(draft.champion, slot.pool, otherItems, context, slot.item.id);
  const buildSlots = draft.buildSlots.map((entry, index) => index === slotIndex ? { ...entry, item } : entry);
  const individualRerollsLeft = draft.individualRerollsLeft - 1;
  return {
    ...draft, buildSlots, individualRerollsLeft, fullBuildRerollsLocked: true,
    revision: draft.revision + 1, status: individualRerollsLeft === 0 ? 'finalizing' : 'editing',
  };
}

export function finalizeBuild(draft: Draft): Draft {
  if (draft.status !== 'editing' && draft.status !== 'finalizing') return draft;
  return { ...draft, status: 'finalized', revision: draft.revision + 1 };
}

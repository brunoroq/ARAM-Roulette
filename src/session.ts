import { isBoots, isItemEligible } from './engine/itemPool.ts';
import type { Draft, DraftRules, GameData, SummonerSpell } from './types/game.ts';

export const sessionStorageKey = 'aram-roulette.session.v3';
export type SessionScreen = { page: 'spells' | 'draft' | 'result'; draft: Draft };

export function serializeSession(screen: SessionScreen): string {
  const { draft } = screen;
  return JSON.stringify({
    page: screen.page, championId: draft.champion.id, spellIds: draft.spells.map(spell => spell.id),
    spellKeys: draft.spellKeys, itemIds: draft.buildSlots.map(slot => slot.item.id),
    fullBuildRerollsLeft: draft.fullBuildRerollsLeft,
    individualRerollsLeft: draft.individualRerollsLeft,
    fullBuildRerollsLocked: draft.fullBuildRerollsLocked,
    revision: draft.revision, status: draft.status,
  });
}

/** Invalid or obsolete sessions reset safely; IDs are rehydrated from the current catalog. */
export function restoreSession(raw: string | null, data: GameData, rules: DraftRules): SessionScreen | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !['spells', 'draft', 'result'].includes(saved.page) || Object.hasOwn(saved, 'choices')) return null;
    if (rules.slots.length !== 6 || rules.slots.some((pool, index) => pool !== (index === 1 ? 'boots' : 'standard'))) return null;
    const champion = data.champions.find(entry => entry.id === saved.championId);
    const spells: (SummonerSpell | undefined)[] = Array.isArray(saved.spellIds) ? saved.spellIds.map((id: string) => data.spells.find(entry => entry.id === id)) : [];
    if (!champion || spells.length !== 2 || spells.some(spell => !spell) || spells[0]!.id === spells[1]!.id) return null;
    if (JSON.stringify(saved.spellKeys) !== '["D","F"]' && JSON.stringify(saved.spellKeys) !== '["F","D"]') return null;
    if (!Number.isInteger(saved.fullBuildRerollsLeft) || saved.fullBuildRerollsLeft < 0 || saved.fullBuildRerollsLeft > rules.fullBuildRerolls) return null;
    if (!Number.isInteger(saved.individualRerollsLeft) || saved.individualRerollsLeft < 0 || saved.individualRerollsLeft > rules.individualRerolls) return null;
    if (typeof saved.fullBuildRerollsLocked !== 'boolean') return null;
    if (saved.fullBuildRerollsLocked !== (saved.individualRerollsLeft < rules.individualRerolls)) return null;
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 0) return null;
    if (saved.page === 'spells' && (saved.fullBuildRerollsLeft !== rules.fullBuildRerolls || saved.individualRerollsLeft !== rules.individualRerolls || saved.revision !== 0)) return null;
    const itemIds = saved.itemIds;
    if (!Array.isArray(itemIds) || itemIds.length !== (saved.page === 'spells' ? 0 : 6)) return null;
    if (saved.page === 'spells' && saved.status !== 'spells') return null;
    if (saved.page === 'draft' && !['editing', 'finalizing'].includes(saved.status)) return null;
    if (saved.page === 'result' && saved.status !== 'finalized') return null;
    if (saved.status === 'editing' && saved.individualRerollsLeft === 0) return null;
    if (saved.status === 'finalizing' && saved.individualRerollsLeft !== 0) return null;
    if (saved.page !== 'spells') {
      const expectedRevision = 1 + (rules.fullBuildRerolls - saved.fullBuildRerollsLeft)
        + (rules.individualRerolls - saved.individualRerollsLeft) + (saved.status === 'finalized' ? 1 : 0);
      if (saved.revision !== expectedRevision) return null;
    }
    const buildSlots: Draft['buildSlots'][number][] = [];
    for (const [index, id] of itemIds.entries()) {
      const item = data.items.find(entry => entry.id === id);
      const pool = rules.slots[index];
      if (!item || !pool || isBoots(item) !== (pool === 'boots') || !isItemEligible(item, champion, buildSlots.map(slot => slot.item))) return null;
      buildSlots.push({ pool, item });
    }
    const draft: Draft = {
      champion, spells: [spells[0]!, spells[1]!], spellKeys: saved.spellKeys,
      buildSlots, fullBuildRerollsLeft: saved.fullBuildRerollsLeft,
      individualRerollsLeft: saved.individualRerollsLeft,
      fullBuildRerollsLocked: saved.fullBuildRerollsLocked,
      revision: saved.revision, status: saved.status,
    };
    return { page: saved.page, draft };
  } catch { return null; }
}

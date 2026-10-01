import type { Draft } from '../types/game.ts';

export function shareFilename(champion: string): string {
  const slug = champion.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '');
  return `aram-roulette-${slug || 'champion'}-build.png`;
}

export function shareModel(draft: Draft) {
  if (draft.status !== 'finalized' || draft.buildSlots.length !== 6) throw new Error('Only a finalized six-item build can be shared.');
  return {
    champion: draft.champion,
    spells: (['D', 'F'] as const).map(key => ({ key, spell: draft.spells[draft.spellKeys.indexOf(key)] })),
    items: draft.buildSlots.map(slot => slot.item),
    total: draft.buildSlots.reduce((sum, slot) => sum + slot.item.cost, 0),
    filename: shareFilename(draft.champion.name),
  };
}

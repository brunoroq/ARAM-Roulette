import type { Champion, Item } from '../types/game.ts';

export function isItemEligible(item: Item, champion: Champion, build: readonly Item[]): boolean {
  if (item.requiredChampion && item.requiredChampion !== champion.id) return false;
  return !build.some(selected => selected.id === item.id || selected.groups.some(group => item.groups.includes(group)));
}

export function validItemPool(items: readonly Item[], champion: Champion, build: readonly Item[]): Item[] {
  return items.filter(item => isItemEligible(item, champion, build));
}

export function isBoots(item: Item): boolean {
  return item.groups.includes('boots');
}

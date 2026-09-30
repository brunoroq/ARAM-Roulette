import catalog from './catalog.json';
import config from './mayhem.json';
import type { DraftRules, GameData } from '../types/game.ts';

export const gameData: GameData = catalog;
export const rules: DraftRules = {
  fullBuildRerolls: config.fullBuildRerolls,
  individualRerolls: config.individualRerolls,
  slots: config.slots.map(pool => {
    if (pool !== 'standard' && pool !== 'boots') throw new Error(`Unknown build slot pool: ${pool}`);
    return pool;
  }),
};

import catalog from './catalog.json';
import config from './mayhem.json';
import type { DraftRules, GameData } from '../types/game.ts';

export const gameData: GameData = catalog;
export const rules: DraftRules = {
  rerolls: config.rerolls,
  rounds: config.rounds.map(pool => {
    if (pool !== 'standard' && pool !== 'boots') throw new Error(`Unknown draft pool: ${pool}`);
    return pool;
  }),
};

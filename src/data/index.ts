import catalog from './catalog.json';
import config from './mayhem.json';
import verification from './verification.json';
import type { DraftRules, GameData } from '../types/game.ts';
import type { VerificationData } from '../verify/types.ts';

export const gameData: GameData = catalog;
export const rules: DraftRules = {
  fullBuildRerolls: config.fullBuildRerolls,
  individualRerolls: config.individualRerolls,
  slots: config.slots.map(pool => {
    if (pool !== 'standard' && pool !== 'boots') throw new Error(`Unknown build slot pool: ${pool}`);
    return pool;
  }),
};

// Riot numeric keys and item recipe facts, used only to check a finished game.
export const verificationData: VerificationData = verification as VerificationData;

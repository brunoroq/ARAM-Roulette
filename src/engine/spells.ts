import type { Draft } from '../types/game.ts';

/** Change only key assignments; the generated pair and all draft resources stay locked. */
export function swapSpellKeys(draft: Draft): Draft {
  return { ...draft, spellKeys: draft.spellKeys[0] === 'D' ? ['F', 'D'] : ['D', 'F'] };
}

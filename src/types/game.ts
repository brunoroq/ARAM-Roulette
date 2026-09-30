export interface Champion {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly icon: string;
}

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly stats: readonly string[];
  readonly cost: number;
  readonly tags: readonly string[];
  readonly groups: readonly string[];
  readonly requiredChampion?: string;
}

export interface SummonerSpell {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
}

export interface GameData {
  readonly version: string;
  readonly champions: readonly Champion[];
  readonly items: readonly Item[];
  readonly spells: readonly SummonerSpell[];
}

export type SlotPool = 'standard' | 'boots';

export interface DraftRules {
  readonly slots: readonly SlotPool[];
  readonly fullBuildRerolls: number;
  readonly individualRerolls: number;
}

export type SpellKeys = readonly ['D', 'F'] | readonly ['F', 'D'];

export interface Draft {
  readonly champion: Champion;
  readonly spells: readonly [SummonerSpell, SummonerSpell];
  readonly spellKeys: SpellKeys;
  readonly buildSlots: readonly { readonly pool: SlotPool; readonly item: Item }[];
  readonly fullBuildRerollsLeft: number;
  readonly individualRerollsLeft: number;
  readonly fullBuildRerollsLocked: boolean;
  readonly revision: number;
  readonly status: 'spells' | 'editing' | 'finalizing' | 'finalized';
}

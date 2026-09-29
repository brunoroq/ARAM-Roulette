export type Language = 'en' | 'es';
export const languageStorageKey = 'aram-roulette.language';

export function parseLanguage(value: string | null): Language {
  return value === 'es' ? 'es' : 'en';
}

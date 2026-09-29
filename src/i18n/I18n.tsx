import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { en } from './en.ts';
import type { Messages } from './en.ts';
import { es } from './es.ts';
import { languageStorageKey, parseLanguage } from './locale.ts';
import type { Language } from './locale.ts';

const translations = { en, es };
const I18nContext = createContext<{
  language: Language;
  setLanguage: (language: Language) => void;
  t: Messages;
  formatNumber: (value: number) => string;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try { return parseLanguage(localStorage.getItem(languageStorageKey)); } catch { return 'en'; }
  });
  const t = translations[language];
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t.app.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.app.description);
    // Private browsing / disabled storage must not prevent using the app.
    try { localStorage.setItem(languageStorageKey, language); } catch { /* Session-only preference. */ }
  }, [language, t]);
  const formatNumber = (value: number) => new Intl.NumberFormat(language).format(value);
  return <I18nContext.Provider value={{ language, setLanguage, t, formatNumber }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n requires I18nProvider.');
  return value;
}

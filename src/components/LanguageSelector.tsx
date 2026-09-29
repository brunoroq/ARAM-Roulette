import { useI18n } from '../i18n/I18n.tsx';
import { parseLanguage } from '../i18n/locale.ts';

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  return <label className="language-selector">
    <span className="sr-only">{t.app.language}</span>
    <select value={language} onChange={event => setLanguage(parseLanguage(event.target.value))}>
      <option value="en">EN</option>
      <option value="es">ES</option>
    </select>
  </label>;
}

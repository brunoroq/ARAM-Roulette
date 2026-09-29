import type { SpellKeys, SummonerSpell } from '../types/game.ts';
import { useI18n } from '../i18n/I18n.tsx';
import { Artwork } from './Artwork.tsx';

export function SpellPair({ spells, spellKeys, expanded = false }: { spells: readonly SummonerSpell[]; spellKeys: SpellKeys; expanded?: boolean }) {
  const { t } = useI18n();
  return <div className={`spell-pair ${expanded ? 'expanded' : ''}`}>
    {(['D', 'F'] as const).map(key => {
      const spell = spells[spellKeys.indexOf(key)];
      return <div className="spell" key={key}>
        {expanded && <span className="dealt-label">{t.spells.dealt}</span>}
        <div className="spell-icon">
          <Artwork key={spell.id} src={spell.icon} name={spell.name} className="spell-content" />
          <span className="spell-key">{key}</span>
        </div>
        <div key={spell.id} className="spell-content"><strong>{spell.name}</strong>{expanded && <p>{spell.description}</p>}</div>
      </div>;
    })}
  </div>;
}

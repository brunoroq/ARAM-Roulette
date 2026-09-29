import { useI18n } from '../i18n/I18n.tsx';
import { useState } from 'react';
import type { Champion } from '../types/game.ts';
import { Artwork } from '../components/Artwork.tsx';
import { ComicHeading, GameButton, GamePanel, StickerLabel } from '../components/game/GameUI.tsx';

export function ChampionSelection({ champions, initialChampion, onStart }: { champions: readonly Champion[]; initialChampion?: Champion; onStart: (champion: Champion) => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Champion | undefined>(initialChampion);
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const matches = champions.filter(champion => normalize(champion.name).includes(normalize(query)));
  const { t } = useI18n();
  return <section className="champions-page">
    <StickerLabel>{t.champions.eyebrow}</StickerLabel>
    <ComicHeading>{t.champions.title}</ComicHeading>
    <p className="intro">{t.champions.intro}</p>
    <div className="selection-layout">
      <div className="roster-panel">
        <div className="search-row"><label className="search"><span aria-hidden="true">⌕</span><input autoFocus type="search" placeholder={t.champions.placeholder} aria-label={t.champions.search} value={query} onChange={event => setQuery(event.target.value)} /></label><span className="quiet" aria-live="polite">{t.champions.count(matches.length)}</span></div>
        <div className="champion-grid" aria-label={t.champions.roster}>
          {matches.map(champion => <button key={champion.id} className={`champion-card ${selected?.id === champion.id ? 'selected' : ''}`} aria-pressed={selected?.id === champion.id} onClick={() => setSelected(champion)}>
            <Artwork src={champion.icon} name={champion.name} /><span>{champion.name}</span>
            {selected?.id === champion.id && <span className="check" aria-hidden="true">✓</span>}
          </button>)}
        </div>
        {matches.length === 0 && <p className="empty-message">{t.champions.empty}</p>}
      </div>
      <aside className="selection-bar">
        <GamePanel paper className="champion-poster">
          <StickerLabel tone="pink">{t.champions.selected}</StickerLabel>
          {selected ? <><Artwork src={selected.icon} name={selected.name} /><h2>{selected.name}</h2><p>{selected.title}</p><span className="poster-stamp">{t.champions.stamp}</span></>
            : <><span className="unknown-portrait" aria-hidden="true">?</span><p>{t.champions.choose}</p></>}
        </GamePanel>
        <GameButton disabled={!selected} onClick={() => selected && onStart(selected)}>{t.champions.start}<span aria-hidden="true">→</span></GameButton>
      </aside>
    </div>
  </section>;
}

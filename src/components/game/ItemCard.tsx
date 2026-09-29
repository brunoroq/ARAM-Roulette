import { useId } from 'react';
import type { Item } from '../../types/game.ts';
import { useI18n } from '../../i18n/I18n.tsx';
import { Artwork } from '../Artwork.tsx';

export function ItemCard({ item, onChoose }: { item: Item; onChoose: () => void }) {
  const { t, formatNumber } = useI18n();
  const detailsId = useId();
  return <div className="item-option">
    <button className="item-card" onClick={event => { if (event.detail < 2) onChoose(); }} aria-label={t.draft.lockItem(item.name)}>
      <span className="card-corner" aria-hidden="true">✦</span>
      <Artwork src={item.icon} name={item.name} />
      <h2>{item.name}</h2>
      <span className="item-cost">{t.draft.gold(formatNumber(item.cost))}</span>
      <ul className="item-stats">{item.stats.map((stat, index) => <li key={index}>{stat}</li>)}</ul>
      <span className="lock-label">{t.draft.lock} <span aria-hidden="true">↗</span></span>
    </button>
    <details className="item-details">
      <summary aria-controls={detailsId}>{t.draft.details(item.name)}</summary>
      <p id={detailsId}>{item.description || t.draft.noDetails}</p>
    </details>
  </div>;
}

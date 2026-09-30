import { useI18n } from '../i18n/I18n.tsx';
import type { Item } from '../types/game.ts';
import { Artwork } from './Artwork.tsx';

export function BuildTray({ items }: { items: readonly Item[] }) {
  const { t, formatNumber } = useI18n();
  return <ol className="build-tray complete" aria-label={t.tray.label}>
    {items.map(item => <li key={item.id} className="filled">
      <Artwork src={item.icon} name={item.name} />
      <span className="slot-name">{item.name}</span>
      <span className="slot-label">{t.tray.gold(formatNumber(item.cost))}</span>
    </li>)}
  </ol>;
}

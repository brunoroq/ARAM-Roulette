import { useI18n } from '../i18n/I18n.tsx';
import type { Item } from '../types/game.ts';
import { Artwork } from './Artwork.tsx';

export function BuildTray({ items, size, complete = false }: { items: readonly Item[]; size: number; complete?: boolean }) {
  const { t, formatNumber } = useI18n();
  return <ol className={`build-tray ${complete ? 'complete' : ''}`} aria-label={t.tray.label}>
    {Array.from({ length: size }, (_, index) => {
      const item = items[index];
      return <li key={item?.id ?? `empty-${index}`} className={item ? 'filled' : index === items.length ? 'current' : ''}>
        {item ? <><Artwork src={item.icon} name={item.name} /><span className="slot-name">{item.name}</span><span className="slot-label">{complete ? t.tray.gold(formatNumber(item.cost)) : <><span aria-hidden="true">✓ </span>{t.tray.locked}</>}</span></>
          : <><span className="empty-slot" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="slot-label">{index === items.length ? t.tray.next : t.tray.unknown}</span></>}
      </li>;
    })}
  </ol>;
}

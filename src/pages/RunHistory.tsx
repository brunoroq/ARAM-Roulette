import { gameData } from '../data/index.ts';
import { useI18n } from '../i18n/I18n.tsx';
import { chronological, runStats } from '../verify/stats.ts';
import type { VerifiedRun } from '../verify/types.ts';
import { Artwork } from '../components/Artwork.tsx';
import { ComicHeading, GameButton, GamePanel, StickerLabel } from '../components/game/GameUI.tsx';

/** Verified runs only, read from local storage; never contacts the League Client. */
export function RunHistory({ runs, onBack }: { runs: readonly VerifiedRun[]; onBack: () => void }) {
  const { t, language } = useI18n();
  const stats = runStats(runs);
  const newestFirst = chronological(runs).reverse();
  const when = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  return <section className="history-page">
    <div className="history-intro">
      <div><StickerLabel tone="pink">{t.history.eyebrow}</StickerLabel><ComicHeading accent={t.history.accent}>{t.history.title}</ComicHeading><p className="intro">{t.history.intro}</p></div>
      <GameButton variant="secondary" onClick={onBack}><span aria-hidden="true">←</span> {t.history.back}</GameButton>
    </div>
    <GamePanel className="history-stats">
      <dl className="history-totals" aria-label={t.verify.totals}>
        <div><dt>{t.verify.runs}</dt><dd>{stats.runs}</dd></div>
        <div><dt>{t.verify.wins}</dt><dd>{stats.wins}</dd></div>
        <div><dt>{t.verify.losses}</dt><dd>{stats.losses}</dd></div>
        <div><dt>{t.history.winRate}</dt><dd>{stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`}</dd></div>
      </dl>
      <div className="history-streak">
        <StickerLabel tone="cyan">{t.history.streakTitle}</StickerLabel>
        <dl>
          <div><dt>{t.history.currentStreak}</dt><dd>{stats.currentStreak}</dd></div>
          <div><dt>{t.history.bestStreak}</dt><dd>{stats.bestStreak}</dd></div>
        </dl>
        <p>{t.history.streakNote}</p>
      </div>
    </GamePanel>
    {newestFirst.length === 0
      ? <p className="history-empty">{t.history.empty}</p>
      : <ol className="history-list" aria-label={t.history.list}>
        {newestFirst.map(run => {
          const champion = gameData.champions.find(entry => entry.id === run.championId);
          return <li key={run.gameId} className="history-card">
            <div className="history-card-head">
              {champion && <Artwork src={champion.icon} name={champion.name} />}
              <div><strong>{champion?.name ?? run.championId}</strong><time dateTime={new Date(run.gameCreation).toISOString()}>{when.format(run.gameCreation)}</time></div>
              <span className={`run-outcome ${run.win ? 'win' : 'loss'}`}>{run.win ? t.verify.victory : t.verify.defeat}</span>
            </div>
            <div className="history-card-tags">
              <span className="history-tag verified">✓ {t.verify.status.verified}</span>
              <span className="history-tag">{t.verify.completed(run.completedItemIds.length)}</span>
            </div>
            <ol className="history-build" aria-label={t.history.build}>
              {run.challengeItemIds.map(id => {
                const item = gameData.items.find(entry => entry.id === id);
                const done = run.completedItemIds.includes(id);
                const name = item?.name ?? id;
                return <li key={id} className={done ? 'done' : 'open'} aria-label={`${name}: ${done ? t.history.itemDone : t.history.itemOpen}`}>
                  {item ? <Artwork src={item.icon} name={name} /> : <span className="artwork fallback" aria-hidden="true">?</span>}
                </li>;
              })}
            </ol>
          </li>;
        })}
      </ol>}
    <p className="menu-note history-note">{t.history.orderNote}</p>
  </section>;
}

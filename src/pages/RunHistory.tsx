import { gameData } from '../data/index.ts';
import { useI18n } from '../i18n/I18n.tsx';
import { isPending, lockOrder } from '../verify/queue.ts';
import { chronological, runStats } from '../verify/stats.ts';
import type { LockedChallenge, RunQueue, VerifiedRun } from '../verify/types.ts';
import { Artwork } from '../components/Artwork.tsx';
import { ComicHeading, GameButton, GamePanel, StickerLabel } from '../components/game/GameUI.tsx';

type Entry =
  | { kind: 'pending'; run: LockedChallenge }
  | { kind: 'verified'; run: VerifiedRun }
  | { kind: 'unresolved'; run: LockedChallenge & { resolution: NonNullable<LockedChallenge['resolution']> } };

/**
 * Pending runs first (newest lock first), then resolved runs by game time, newest first. Read from
 * local storage only; never contacts the League Client. Stats come from verified runs alone.
 */
export function RunHistory({ history, queue, onBack }: { history: readonly VerifiedRun[]; queue: RunQueue; onBack: () => void }) {
  const { t, language } = useI18n();
  const stats = runStats(history);
  const when = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' });
  const pending: Entry[] = lockOrder(queue.runs.filter(isPending)).reverse().map(run => ({ kind: 'pending', run }));
  const resolved = [
    ...chronological(history).map(run => ({ time: run.gameCreation, id: run.gameId, entry: { kind: 'verified', run } as Entry })),
    ...queue.runs.flatMap(run => (run.resolution && run.resolution.kind !== 'verified'
      ? [{ time: run.resolution.gameCreation, id: run.resolution.gameId, entry: { kind: 'unresolved', run } as Entry }] : [])),
  ].sort((a, b) => b.time - a.time || b.id - a.id).map(item => item.entry);
  const entries = [...pending, ...resolved];

  const build = (itemIds: readonly string[], completed?: readonly string[]) => <ol className="history-build" aria-label={t.history.build}>
    {itemIds.map(id => {
      const item = gameData.items.find(entry => entry.id === id);
      const name = item?.name ?? id;
      const state = !completed ? '' : completed.includes(id) ? 'done' : 'open';
      return <li key={id} className={state} aria-label={completed ? `${name}: ${completed.includes(id) ? t.history.itemDone : t.history.itemOpen}` : name}>
        {item ? <Artwork src={item.icon} name={name} /> : <span className="artwork fallback" aria-hidden="true">?</span>}
      </li>;
    })}
  </ol>;
  const head = (championId: string, time: string, iso: string, outcome?: { win: boolean }) => {
    const champion = gameData.champions.find(entry => entry.id === championId);
    return <div className="history-card-head">
      {champion && <Artwork src={champion.icon} name={champion.name} />}
      <div><strong>{champion?.name ?? championId}</strong><time dateTime={iso}>{time}</time></div>
      {outcome && <span className={`run-outcome ${outcome.win ? 'win' : 'loss'}`}>{outcome.win ? t.verify.victory : t.verify.defeat}</span>}
    </div>;
  };

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
    {entries.length === 0
      ? <p className="history-empty">{t.history.empty}</p>
      : <ol className="history-list" aria-label={t.history.list}>
        {entries.map(entry => {
          if (entry.kind === 'verified') {
            const { run } = entry;
            return <li key={`v${run.gameId}`} className="history-card">
              {head(run.championId, when.format(run.gameCreation), new Date(run.gameCreation).toISOString(), run)}
              <div className="history-card-tags">
                <span className="history-tag verified">✓ {t.verify.status.verified}</span>
                <span className="history-tag">{t.verify.completed(run.completedItemIds.length)}</span>
              </div>
              {build(run.challengeItemIds, run.completedItemIds)}
            </li>;
          }
          if (entry.kind === 'pending') {
            const { run } = entry;
            return <li key={`p${run.id}`} className="history-card pending">
              {head(run.championId, t.history.lockedAt(when.format(run.lockedAt)), new Date(run.lockedAt).toISOString())}
              <div className="history-card-tags"><span className="history-tag pending">{t.verify.status.pending}</span></div>
              <p className="history-card-text">{t.verify.waiting} {run.activeGameId !== undefined ? t.verify.linkedActive : t.verify.nextMatch}</p>
              <p className="history-card-note">{t.verify.delayHint}</p>
              {build(run.itemIds)}
            </li>;
          }
          const { run } = entry;
          const resolution = run.resolution;
          if (resolution.kind === 'verified') return null; // Shown from history instead.
          return <li key={`r${run.id}`} className={`history-card ${resolution.kind}`}>
            {head(run.championId, when.format(resolution.gameCreation), new Date(resolution.gameCreation).toISOString())}
            <div className="history-card-tags"><span className={`history-tag ${resolution.kind}`}>{t.verify.status[resolution.kind]}</span></div>
            <p className="history-card-text">{resolution.kind === 'cancelled' ? t.verify.cancelledText : t.verify.couldNot} {t.verify.reasons[resolution.reason]}</p>
            {build(run.itemIds)}
          </li>;
        })}
      </ol>}
    <p className="menu-note history-note">{t.history.orderNote}</p>
  </section>;
}

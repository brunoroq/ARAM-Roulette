import { gameData } from '../data/index.ts';
import { useI18n } from '../i18n/I18n.tsx';
import { runStatus } from '../verify/queue.ts';
import { runStats } from '../verify/stats.ts';
import type { LockedChallenge, PendingReason, VerifiedRun } from '../verify/types.ts';
import { Artwork } from './Artwork.tsx';
import { GameButton, GamePanel, StickerLabel } from './game/GameUI.tsx';

type CheckState = 'pass' | 'fail' | 'unknown';
const marks: Record<CheckState, string> = { pass: '✓', fail: '✗', unknown: '?' };

export function Check({ state, label }: { state: CheckState; label: string }) {
  const { t } = useI18n();
  const spoken = state === 'pass' ? t.verify.passed : state === 'fail' ? t.verify.failed : t.verify.unknown;
  return <li className={`run-check-item ${state}`}><span aria-hidden="true">{marks[state]}</span>{label}<span className="sr-only">: {spoken}</span></li>;
}

/** One locked run and its verification state. Checks themselves run in useRunVerification. */
export function RunCheck({ run, history, checking, notice, binding = false, fresh = false, showBuild = false, onVerify }: {
  run: LockedChallenge;
  history: readonly VerifiedRun[];
  checking: boolean;
  notice: PendingReason | null;
  /** The active-match check after LOCK IT IN is still running. */
  binding?: boolean;
  /** The result was just reached by an automatic check. */
  fresh?: boolean;
  showBuild?: boolean;
  onVerify: () => void;
}) {
  const { t } = useI18n();
  const champion = gameData.champions.find(entry => entry.id === run.championId);
  const items = run.itemIds.flatMap(id => gameData.items.filter(item => item.id === id));
  const verified = history.find(entry => entry.challengeId === run.id);
  const stats = runStats(history);
  const status = runStatus(run);
  const resolution = run.resolution;
  const tone = status === 'verified' ? 'cyan' : status === 'pending' ? 'paper' : 'pink';

  return <GamePanel paper className={`run-check ${fresh ? 'fresh' : ''}`} role="region" aria-label={t.verify.label}>
    <div className="run-check-head">
      <StickerLabel tone={tone}>{checking && status === 'pending' ? t.verify.status.checking : t.verify.status[status]}</StickerLabel>
      <h2>{t.verify.title}</h2>
      {fresh && <span className="run-check-fresh">{t.verify.fresh}</span>}
    </div>
    {showBuild && champion && <div className="run-check-build">
      <span className="run-check-label">{t.verify.lockedChallenge}</span>
      <span className="run-check-champion"><Artwork src={champion.icon} name={champion.name} /><strong>{champion.name}</strong></span>
      <ol className="run-check-items">{items.map(item => <li key={item.id}><Artwork src={item.icon} name={item.name} /></li>)}</ol>
    </div>}
    {status === 'pending' && <>
      <p className="run-check-state">{checking ? t.verify.checkingText : t.verify.waiting}</p>
      <p className="run-check-link">{binding ? t.verify.linking : run.activeGameId !== undefined ? t.verify.linkedActive : t.verify.nextMatch}</p>
      <p>{t.verify.lockHint} {t.verify.delayHint}</p>
    </>}
    {resolution?.kind === 'verified' && <>
      <ul className="run-checks">
        <Check state="pass" label={t.verify.champion} />
        <Check state="pass" label={t.verify.summoners} />
        <Check state="pass" label={t.verify.build} />
        {verified && <li className="run-check-item count">{t.verify.completed(verified.completedItemIds.length)}</li>}
      </ul>
      {verified && <strong className={`run-outcome ${verified.win ? 'win' : 'loss'}`}>{verified.win ? t.verify.victory : t.verify.defeat}</strong>}
      <p className="run-check-note">{t.verify.orderNote}</p>
    </>}
    {resolution?.kind === 'unverifiable' && <>
      <p className="run-check-state">{t.verify.couldNot}</p>
      <ul className="run-checks">
        <Check state="pass" label={t.verify.champion} />
        <Check state="pass" label={t.verify.summoners} />
        <Check state={resolution.reason === 'BUILD_MISMATCH' ? 'fail' : 'unknown'} label={t.verify.build} />
      </ul>
      <p>{t.verify.reasons[resolution.reason]}</p>
    </>}
    {resolution?.kind === 'cancelled' && <>
      <p className="run-check-state">{t.verify.cancelledText}</p>
      {resolution.reason !== 'GAME_ALREADY_COUNTED' && <ul className="run-checks">
        <Check state={resolution.championMatch ? 'pass' : 'fail'} label={t.verify.champion} />
        <Check state={resolution.spellsMatch ? 'pass' : 'fail'} label={t.verify.summoners} />
      </ul>}
      <p>{t.verify.reasons[resolution.reason]}</p>
    </>}
    <p className="run-check-notice" role="status">{notice ? t.verify.reasons[notice] : ''}</p>
    {status === 'pending' && <GameButton disabled={checking} onClick={onVerify}>
      {checking ? t.verify.checking : notice ? t.verify.again : t.verify.button}
    </GameButton>}
    {stats.runs > 0 && <dl className="run-totals" aria-label={t.verify.totals}>
      <div><dt>{t.verify.runs}</dt><dd>{stats.runs}</dd></div>
      <div><dt>{t.verify.wins}</dt><dd>{stats.wins}</dd></div>
      <div><dt>{t.verify.losses}</dt><dd>{stats.losses}</dd></div>
    </dl>}
  </GamePanel>;
}

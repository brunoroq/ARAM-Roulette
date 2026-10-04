import { assets } from './assets.ts';
import { swapSpellKeys } from './engine/spells.ts';
import { useEffect, useRef, useState } from 'react';
import { gameData, rules, verificationData } from './data/index.ts';
import { createDraft, finalizeBuild, generateBuild, rerollBuild, rerollSlot } from './engine/draft.ts';
import type { Champion, Draft } from './types/game.ts';
import { restoreSession, serializeSession, sessionStorageKey } from './session.ts';
import { useI18n } from './i18n/I18n.tsx';
import { GameBackdrop, GameButton } from './components/game/GameUI.tsx';
import { ReturnHomeDialog } from './components/game/ReturnHomeDialog.tsx';
import { ConfirmDialog } from './components/game/ConfirmDialog.tsx';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import { Welcome } from './pages/Welcome.tsx';
import { ChampionSelection } from './pages/ChampionSelection.tsx';
import { Spells } from './pages/Spells.tsx';
import { ItemDraft } from './pages/ItemDraft.tsx';
import { FinalBuild } from './pages/FinalBuild.tsx';
import { RunHistory } from './pages/RunHistory.tsx';
import { RunCheck } from './components/RunCheck.tsx';
import {
  challengeMatchesDraft, createChallenge, emptyQueue, historyStorageKey, legacyChallengeStorageKey, migrateLegacyChallenge,
  parseHistory, parseQueue, queueStorageKey, serializeHistory, serializeQueue,
} from './verify/challenge.ts';
import { lockOrder, waitingForNextGame } from './verify/queue.ts';
import type { RunQueue, VerifiedRun } from './verify/types.ts';
import { useRunVerification, type Verification } from './verify/useRunVerification.ts';

type Screen = { page: 'welcome' | 'history' } | { page: 'champions'; champion?: Champion } | { page: 'spells' | 'draft' | 'result'; draft: Draft };
const context = { data: gameData, rules };
function persist(screen: Screen) {
  try {
    if ('draft' in screen) localStorage.setItem(sessionStorageKey, serializeSession(screen));
    else localStorage.removeItem(sessionStorageKey);
  } catch { /* Storage may be unavailable; the current run still works. */ }
}
function readStored<T>(key: string, parse: (raw: string | null) => T, fallback: T): T {
  try { return parse(localStorage.getItem(key)); } catch { return fallback; }
}
/** The run queue; on first start after v0.1.4, a pending single challenge moves into it. */
function loadQueue(): RunQueue {
  try {
    const raw = localStorage.getItem(queueStorageKey);
    if (raw !== null) return parseQueue(raw);
    const legacy = migrateLegacyChallenge(localStorage.getItem(legacyChallengeStorageKey));
    const queue: RunQueue = legacy ? { runs: [legacy], claimedGameIds: [] } : emptyQueue;
    localStorage.setItem(queueStorageKey, serializeQueue(queue));
    localStorage.removeItem(legacyChallengeStorageKey);
    return queue;
  } catch { return emptyQueue; }
}

export function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    try { return restoreSession(localStorage.getItem(sessionStorageKey), gameData, rules) ?? { page: 'welcome' }; }
    catch { return { page: 'welcome' }; }
  });
  const [error, setError] = useState(false);
  const [queue, setQueue] = useState<RunQueue>(loadQueue);
  const [history, setHistory] = useState<readonly VerifiedRun[]>(() => readStored(historyStorageKey, parseHistory, []));
  const [confirmingHome, setConfirmingHome] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  /** The finalized-but-unlocked build the player chose not to lock from the waiting-run prompt. */
  const [keptDraft, setKeptDraft] = useState<Draft | null>(null);
  const { t } = useI18n();
  const verification = useRunVerification({ queue, history, onSave: saveVerification });
  const { dismissAnnouncement } = verification;
  useEffect(() => dismissAnnouncement(), [screen.page, dismissAnnouncement]);
  // The waiting run was resolved while the prompt was open: nothing is left to replace or queue behind.
  const waitingNow = waitingForNextGame(queue) !== null;
  useEffect(() => { if (confirmingReplace && !waitingNow) keepPendingRun(); });
  const main = useRef<HTMLElement>(null);
  const enteringBuild = useRef(false);
  const homePromptOpen = useRef(false);
  const replacePromptOpen = useRef(false);
  useEffect(() => {
    // Return keyboard focus to the new screen.
    if (screen.page !== 'champions') main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screen.page]);
  useEffect(() => persist(screen), [screen]);
  useEffect(() => { if (screen.page === 'spells') enteringBuild.current = false; }, [screen.page]);

  function attempt(action: () => Screen) {
    try { const next = action(); persist(next); setScreen(next); setError(false); } catch {
      setError(true);
    }
  }
  const start = (champion: Champion) => {
    homePromptOpen.current = false;
    attempt(() => ({ page: 'spells', draft: createDraft(champion, context) }));
  };
  function continueToBuild() {
    if (screen.page !== 'spells' || enteringBuild.current) return;
    enteringBuild.current = true;
    try { const next: Screen = { page: 'draft', draft: generateBuild(screen.draft, context) }; persist(next); setScreen(next); setError(false); }
    catch { enteringBuild.current = false; setError(true); }
  }
  function updateBuild(action: (draft: Draft) => Draft): boolean {
    if (screen.page !== 'draft') return false;
    try {
      const draft = action(screen.draft);
      if (draft === screen.draft) return false;
      const next: Screen = { page: 'draft', draft };
      persist(next);
      setScreen(next);
      setError(false);
      return true;
    } catch { setError(true); return false; }
  }
  const rerollEverything = (revision: number) => updateBuild(draft => rerollBuild(draft, revision, context));
  const reroll = (index: number, revision: number) => updateBuild(draft => rerollSlot(draft, index, revision, context));
  function saveVerification(next: Verification) {
    try {
      localStorage.setItem(queueStorageKey, serializeQueue(next.queue));
      localStorage.setItem(historyStorageKey, serializeHistory(next.history));
    } catch { /* Shown for this session only. */ }
    setQueue(next.queue);
    setHistory(next.history);
  }
  function lockIn(source: Draft, options: { replaceId?: string; bindable: boolean }) {
    attempt(() => {
      const draft = finalizeBuild(source);
      if (draft !== source) {
        // Verification is optional: a locking problem must never block the build itself.
        try { void verification.lockRun(createChallenge(draft, verificationData, Date.now()), options); } catch { /* No run queued. */ }
      }
      return { page: 'result', draft };
    });
  }
  function finish() {
    if (homePromptOpen.current || replacePromptOpen.current || screen.page !== 'draft') return;
    // Latest known queue, so a run resolved since the last render isn't treated as waiting.
    if (waitingForNextGame(verification.currentQueue())) {
      replacePromptOpen.current = true;
      setConfirmingReplace(true);
      return;
    }
    lockIn(screen.draft, { bindable: true });
  }
  function keepPendingRun() {
    if (!replacePromptOpen.current) return;
    replacePromptOpen.current = false;
    setConfirmingReplace(false);
    if (screen.page === 'draft') setKeptDraft(screen.draft);
  }
  /** Neither choice can bind: with a run already waiting, a match in progress may be that run's game. */
  function resolvePrompt(replace: boolean) {
    if (!replacePromptOpen.current || screen.page !== 'draft') return;
    replacePromptOpen.current = false; // One lock per prompt, however many clicks.
    setConfirmingReplace(false);
    lockIn(screen.draft, { bindable: false, replaceId: replace ? waitingForNextGame(verification.currentQueue())?.id : undefined });
  }
  function requestHome() {
    homePromptOpen.current = true;
    setConfirmingHome(true);
  }
  function cancelHome() {
    homePromptOpen.current = false;
    setConfirmingHome(false);
  }
  function returnHome() {
    // Keep the guard raised until a new session starts so a queued finish cannot restore this build.
    const welcome: Screen = { page: 'welcome' };
    persist(welcome);
    setScreen(welcome);
    setError(false);
    setConfirmingHome(false);
  }

  const newestRun = lockOrder(queue.runs).at(-1) ?? null;
  const shownRun = screen.page === 'welcome' ? newestRun
    : screen.page === 'result' ? lockOrder(queue.runs.filter(run => challengeMatchesDraft(run, screen.draft, verificationData))).at(-1) ?? null : null;
  const runCheck = (showBuild: boolean) => shownRun && <RunCheck run={shownRun} history={history} checking={verification.checking}
    notice={verification.notices[shownRun.id] ?? null} binding={verification.binding === shownRun.id}
    fresh={verification.announcement?.runId === shownRun.id} showBuild={showBuild} onVerify={() => { void verification.verify('manual'); }} />;
  const announced = verification.announcement && verification.announcement.runId !== shownRun?.id ? verification.announcement : null;
  const announcedRun = announced?.kind === 'verified' ? history.find(run => run.challengeId === announced.runId) : undefined;
  const bannerText = !announced ? '' : announced.kind === 'cancelled' ? t.verify.bannerCancelled
    : announced.kind === 'unverifiable' || !announcedRun ? t.verify.bannerUnverifiable : t.verify.bannerVerified(announcedRun.win ? t.verify.victory : t.verify.defeat);

  return <div className="app-shell"><GameBackdrop />
    <header className="app-header"><div className="wordmark"><img src={assets.logoCompact} alt={t.app.title} /></div><div className="header-controls"><span className="mode-badge">{t.app.mode}</span><LanguageSelector /></div></header>
    <main ref={main} tabIndex={-1}>
      {announced && <div className="verify-banner" role="status">
        <span>{bannerText}</span>
        <GameButton variant="secondary" onClick={() => setScreen({ page: 'history' })}>{t.verify.bannerOpen}</GameButton>
        <GameButton variant="secondary" onClick={dismissAnnouncement}>{t.verify.dismiss}</GameButton>
      </div>}
      {error && <div className="error" role="alert">{t.app.error} <GameButton variant="secondary" onClick={() => { setError(false); setScreen({ page: 'champions' }); }}>{t.app.back}</GameButton></div>}
      {screen.page === 'welcome' && <Welcome runCheck={runCheck(true)} onHistory={() => setScreen({ page: 'history' })} onStart={() => setScreen({ page: 'champions' })} />}
      {screen.page === 'history' && <RunHistory history={history} queue={queue} onBack={() => setScreen({ page: 'welcome' })} />}
      {screen.page === 'champions' && <ChampionSelection champions={gameData.champions} initialChampion={screen.champion} onStart={start} />}
      {screen.page === 'spells' && <Spells draft={screen.draft} onSwap={() => setScreen(current => current.page === 'spells' ? { ...current, draft: swapSpellKeys(current.draft) } : current)} onContinue={continueToBuild} />}
      {screen.page === 'draft' && <ItemDraft draft={screen.draft} allItems={gameData.items} fullRerollTotal={rules.fullBuildRerolls} individualRerollTotal={rules.individualRerolls} confirmingHome={confirmingHome} holdFinish={confirmingReplace || keptDraft === screen.draft} onRerollBuild={rerollEverything} onReroll={reroll} onFinish={finish} onReturnHome={requestHome} />}
      {screen.page === 'result' && <FinalBuild draft={screen.draft} runCheck={runCheck(false)} onNewBuild={() => start(screen.draft.champion)} onChangeChampion={() => setScreen({ page: 'champions', champion: screen.draft.champion })} onReturnHome={requestHome} />}
    </main>
    {confirmingHome && <ReturnHomeDialog onCancel={cancelHome} onConfirm={returnHome} />}
    {confirmingReplace && <ConfirmDialog id="replace-run" title={t.verify.replaceTitle} message={t.verify.replaceMessage}
      cancelLabel={t.app.cancel} confirmLabel={t.verify.replaceConfirm} onCancel={keepPendingRun} onConfirm={() => resolvePrompt(true)}
      extra={{ label: t.verify.addNext, onClick: () => resolvePrompt(false) }} />}
    <footer><span>{t.app.footer}</span><span>{t.app.dataVersion(gameData.version)}</span><small>{t.app.disclaimer}</small></footer>
  </div>;
}

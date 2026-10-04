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
import { challengeMatchesDraft, challengeStorageKey, createChallenge, historyStorageKey, parseChallenge, parseHistory, serializeHistory } from './verify/challenge.ts';
import type { LockedChallenge, VerifiedRun } from './verify/types.ts';
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

export function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    try { return restoreSession(localStorage.getItem(sessionStorageKey), gameData, rules) ?? { page: 'welcome' }; }
    catch { return { page: 'welcome' }; }
  });
  const [error, setError] = useState(false);
  const [challenge, setChallenge] = useState<LockedChallenge | null>(() => readStored(challengeStorageKey, parseChallenge, null));
  const [runs, setRuns] = useState<readonly VerifiedRun[]>(() => readStored(historyStorageKey, parseHistory, []));
  const [confirmingHome, setConfirmingHome] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  /** The finalized-but-unlocked build whose replacement the player declined. */
  const [keptDraft, setKeptDraft] = useState<Draft | null>(null);
  const { t } = useI18n();
  const verification = useRunVerification({ challenge, runs, onSave: saveVerification });
  const { dismissAnnouncement } = verification;
  useEffect(() => dismissAnnouncement(), [screen.page, dismissAnnouncement]);
  // The pending run was resolved while the replace prompt was open: nothing is left to replace.
  const pendingNow = challenge?.status === 'pending';
  useEffect(() => { if (confirmingReplace && !pendingNow) keepPendingRun(); });
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
  function saveChallenge(next: LockedChallenge) {
    try { localStorage.setItem(challengeStorageKey, JSON.stringify(next)); } catch { /* Shown for this session only. */ }
    verification.syncChallenge(next); // An in-flight check for a replaced challenge is then discarded.
    setChallenge(next);
  }
  function saveVerification(next: Verification) {
    try { localStorage.setItem(historyStorageKey, serializeHistory(next.runs)); } catch { /* Shown for this session only. */ }
    saveChallenge(next.challenge);
    setRuns(next.runs);
  }
  function lockIn(source: Draft) {
    attempt(() => {
      const draft = finalizeBuild(source);
      if (draft !== source) {
        // Verification is optional: a locking problem must never block the build itself.
        // Locking writes only the challenge; history is never rewritten from here.
        try { saveChallenge(createChallenge(draft, verificationData, Date.now())); } catch { /* No pending challenge. */ }
      }
      return { page: 'result', draft };
    });
  }
  function finish() {
    if (homePromptOpen.current || replacePromptOpen.current || screen.page !== 'draft') return;
    // Latest known state, so a run verified since the last render isn't treated as pending.
    if (verification.currentChallenge()?.status === 'pending') {
      replacePromptOpen.current = true;
      setConfirmingReplace(true);
      return;
    }
    lockIn(screen.draft);
  }
  function keepPendingRun() {
    if (!replacePromptOpen.current) return;
    replacePromptOpen.current = false;
    setConfirmingReplace(false);
    if (screen.page === 'draft') setKeptDraft(screen.draft);
  }
  function replacePendingRun() {
    if (!replacePromptOpen.current || screen.page !== 'draft') return;
    replacePromptOpen.current = false; // One replacement per confirmation, however many clicks.
    setConfirmingReplace(false);
    lockIn(screen.draft);
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

  const runCheckVisible = !!challenge && (screen.page === 'welcome' || (screen.page === 'result' && challengeMatchesDraft(challenge, screen.draft, verificationData)));
  const runCheck = (showBuild: boolean) => challenge && <RunCheck challenge={challenge} runs={runs} checking={verification.checking} notice={verification.notice}
    fresh={verification.announcement !== null} showBuild={showBuild} onVerify={() => { void verification.verify('manual'); }} />;
  const latestRun = verification.announcement === 'verified' ? runs.find(run => run.challengeId === challenge?.id) : undefined;

  return <div className="app-shell"><GameBackdrop />
    <header className="app-header"><div className="wordmark"><img src={assets.logoCompact} alt={t.app.title} /></div><div className="header-controls"><span className="mode-badge">{t.app.mode}</span><LanguageSelector /></div></header>
    <main ref={main} tabIndex={-1}>
      {verification.announcement && !runCheckVisible && <div className="verify-banner" role="status">
        <span>{latestRun ? t.verify.bannerVerified(latestRun.win ? t.verify.victory : t.verify.defeat) : t.verify.bannerUnverifiable}</span>
        {latestRun && <GameButton variant="secondary" onClick={() => setScreen({ page: 'history' })}>{t.verify.bannerOpen}</GameButton>}
        <GameButton variant="secondary" onClick={dismissAnnouncement}>{t.verify.dismiss}</GameButton>
      </div>}
      {error && <div className="error" role="alert">{t.app.error} <GameButton variant="secondary" onClick={() => { setError(false); setScreen({ page: 'champions' }); }}>{t.app.back}</GameButton></div>}
      {screen.page === 'welcome' && <Welcome runCheck={runCheck(true)} onHistory={() => setScreen({ page: 'history' })} onStart={() => setScreen({ page: 'champions' })} />}
      {screen.page === 'history' && <RunHistory runs={runs} onBack={() => setScreen({ page: 'welcome' })} />}
      {screen.page === 'champions' && <ChampionSelection champions={gameData.champions} initialChampion={screen.champion} onStart={start} />}
      {screen.page === 'spells' && <Spells draft={screen.draft} onSwap={() => setScreen(current => current.page === 'spells' ? { ...current, draft: swapSpellKeys(current.draft) } : current)} onContinue={continueToBuild} />}
      {screen.page === 'draft' && <ItemDraft draft={screen.draft} allItems={gameData.items} fullRerollTotal={rules.fullBuildRerolls} individualRerollTotal={rules.individualRerolls} confirmingHome={confirmingHome} holdFinish={confirmingReplace || keptDraft === screen.draft} onRerollBuild={rerollEverything} onReroll={reroll} onFinish={finish} onReturnHome={requestHome} />}
      {screen.page === 'result' && <FinalBuild draft={screen.draft} runCheck={runCheckVisible && runCheck(false)} onNewBuild={() => start(screen.draft.champion)} onChangeChampion={() => setScreen({ page: 'champions', champion: screen.draft.champion })} onReturnHome={requestHome} />}
    </main>
    {confirmingHome && <ReturnHomeDialog onCancel={cancelHome} onConfirm={returnHome} />}
    {confirmingReplace && <ConfirmDialog id="replace-run" title={t.verify.replaceTitle} message={t.verify.replaceMessage}
      cancelLabel={t.verify.replaceKeep} confirmLabel={t.verify.replaceConfirm} onCancel={keepPendingRun} onConfirm={replacePendingRun} />}
    <footer><span>{t.app.footer}</span><span>{t.app.dataVersion(gameData.version)}</span><small>{t.app.disclaimer}</small></footer>
  </div>;
}

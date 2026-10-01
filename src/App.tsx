import { assets } from './assets.ts';
import { swapSpellKeys } from './engine/spells.ts';
import { useEffect, useRef, useState } from 'react';
import { gameData, rules } from './data/index.ts';
import { createDraft, finalizeBuild, generateBuild, rerollBuild, rerollSlot } from './engine/draft.ts';
import type { Champion, Draft } from './types/game.ts';
import { restoreSession, serializeSession, sessionStorageKey } from './session.ts';
import { useI18n } from './i18n/I18n.tsx';
import { GameBackdrop, GameButton } from './components/game/GameUI.tsx';
import { ReturnHomeDialog } from './components/game/ReturnHomeDialog.tsx';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import { Welcome } from './pages/Welcome.tsx';
import { ChampionSelection } from './pages/ChampionSelection.tsx';
import { Spells } from './pages/Spells.tsx';
import { ItemDraft } from './pages/ItemDraft.tsx';
import { FinalBuild } from './pages/FinalBuild.tsx';

type Screen = { page: 'welcome' } | { page: 'champions'; champion?: Champion } | { page: 'spells' | 'draft' | 'result'; draft: Draft };
const context = { data: gameData, rules };
function persist(screen: Screen) {
  try {
    if ('draft' in screen) localStorage.setItem(sessionStorageKey, serializeSession(screen));
    else localStorage.removeItem(sessionStorageKey);
  } catch { /* Storage may be unavailable; the current run still works. */ }
}

export function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    try { return restoreSession(localStorage.getItem(sessionStorageKey), gameData, rules) ?? { page: 'welcome' }; }
    catch { return { page: 'welcome' }; }
  });
  const [error, setError] = useState(false);
  const [confirmingHome, setConfirmingHome] = useState(false);
  const { t } = useI18n();
  const main = useRef<HTMLElement>(null);
  const enteringBuild = useRef(false);
  const homePromptOpen = useRef(false);
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
  function finish() {
    if (!homePromptOpen.current && screen.page === 'draft') attempt(() => ({ page: 'result', draft: finalizeBuild(screen.draft) }));
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

  return <div className="app-shell"><GameBackdrop />
    <header className="app-header"><div className="wordmark"><img src={assets.logoCompact} alt={t.app.title} /></div><div className="header-controls"><span className="mode-badge">{t.app.mode}</span><LanguageSelector /></div></header>
    <main ref={main} tabIndex={-1}>
      {error && <div className="error" role="alert">{t.app.error} <GameButton variant="secondary" onClick={() => { setError(false); setScreen({ page: 'champions' }); }}>{t.app.back}</GameButton></div>}
      {screen.page === 'welcome' && <Welcome onStart={() => setScreen({ page: 'champions' })} />}
      {screen.page === 'champions' && <ChampionSelection champions={gameData.champions} initialChampion={screen.champion} onStart={start} />}
      {screen.page === 'spells' && <Spells draft={screen.draft} onSwap={() => setScreen(current => current.page === 'spells' ? { ...current, draft: swapSpellKeys(current.draft) } : current)} onContinue={continueToBuild} />}
      {screen.page === 'draft' && <ItemDraft draft={screen.draft} allItems={gameData.items} fullRerollTotal={rules.fullBuildRerolls} individualRerollTotal={rules.individualRerolls} confirmingHome={confirmingHome} onRerollBuild={rerollEverything} onReroll={reroll} onFinish={finish} onReturnHome={requestHome} />}
      {screen.page === 'result' && <FinalBuild draft={screen.draft} onNewBuild={() => start(screen.draft.champion)} onChangeChampion={() => setScreen({ page: 'champions', champion: screen.draft.champion })} onReturnHome={requestHome} />}
    </main>
    {confirmingHome && <ReturnHomeDialog onCancel={cancelHome} onConfirm={returnHome} />}
    <footer><span>{t.app.footer}</span><span>{t.app.dataVersion(gameData.version)}</span><small>{t.app.disclaimer}</small></footer>
  </div>;
}

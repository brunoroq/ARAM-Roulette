import { assets } from './assets.ts';
import { swapSpellKeys } from './engine/spells.ts';
import { useEffect, useRef, useState } from 'react';
import { gameData, rules } from './data/index.ts';
import { getRoundPool, createDraft, rerollItemChoices, selectItem } from './engine/draft.ts';
import type { Champion, Draft } from './types/game.ts';
import { useI18n } from './i18n/I18n.tsx';
import { GameBackdrop, GameButton } from './components/game/GameUI.tsx';
import { LanguageSelector } from './components/LanguageSelector.tsx';
import { Welcome } from './pages/Welcome.tsx';
import { ChampionSelection } from './pages/ChampionSelection.tsx';
import { Spells } from './pages/Spells.tsx';
import { ItemDraft } from './pages/ItemDraft.tsx';
import { FinalBuild } from './pages/FinalBuild.tsx';

type Screen = { page: 'welcome' } | { page: 'champions'; champion?: Champion } | { page: 'spells' | 'draft' | 'result'; draft: Draft };
const context = { data: gameData, rules };

export function App() {
  const [screen, setScreen] = useState<Screen>({ page: 'welcome' });
  const [error, setError] = useState(false);
  const { t } = useI18n();
  const main = useRef<HTMLElement>(null);
  const draftRevision = 'draft' in screen ? screen.draft.revision : -1;
  useEffect(() => {
    // Return keyboard focus to the new content when a screen or offer changes.
    if (screen.page !== 'champions') main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screen.page]);
  useEffect(() => {
    if (screen.page === 'draft') main.current?.focus({ preventScroll: true });
  }, [draftRevision, screen.page]);

  function attempt(action: () => Screen) {
    try { setScreen(action()); setError(false); } catch {
      setError(true);
    }
  }
  const start = (champion: Champion) => attempt(() => ({ page: 'spells', draft: createDraft(champion, context) }));
  function choose(id: string, revision: number) {
    if (screen.page !== 'draft') return;
    attempt(() => {
      const draft = selectItem(screen.draft, id, revision, context);
      return { page: draft.status === 'complete' ? 'result' : 'draft', draft };
    });
  }
  function reroll(revision: number) {
    if (screen.page === 'draft') attempt(() => ({ page: 'draft', draft: rerollItemChoices(screen.draft, revision, context) }));
  }

  return <div className="app-shell"><GameBackdrop />
    <header className="app-header"><div className="wordmark"><img src={assets.logoCompact} alt={t.app.title} /></div><div className="header-controls"><span className="mode-badge">{t.app.mode}</span><LanguageSelector /></div></header>
    <main ref={main} tabIndex={-1}>
      {error && <div className="error" role="alert">{t.app.error} <GameButton variant="secondary" onClick={() => { setError(false); setScreen({ page: 'champions' }); }}>{t.app.back}</GameButton></div>}
      {screen.page === 'welcome' && <Welcome onStart={() => setScreen({ page: 'champions' })} />}
      {screen.page === 'champions' && <ChampionSelection champions={gameData.champions} initialChampion={screen.champion} onStart={start} />}
      {screen.page === 'spells' && <Spells draft={screen.draft} onSwap={() => setScreen(current => current.page === 'spells' ? { ...current, draft: swapSpellKeys(current.draft) } : current)} onContinue={() => setScreen({ page: 'draft', draft: screen.draft })} />}
      {screen.page === 'draft' && <ItemDraft draft={screen.draft} buildSize={rules.rounds.length} rerollTotal={rules.rerolls} roundPool={getRoundPool(screen.draft.items, rules)} onChoose={choose} onReroll={reroll} />}
      {screen.page === 'result' && <FinalBuild draft={screen.draft} onNewBuild={() => start(screen.draft.champion)} onChangeChampion={() => setScreen({ page: 'champions', champion: screen.draft.champion })} />}
    </main>
    <footer><span>{t.app.footer}</span><span>{t.app.dataVersion(gameData.version)}</span><small>{t.app.disclaimer}</small></footer>
  </div>;
}

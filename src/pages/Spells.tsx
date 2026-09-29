import { useI18n } from '../i18n/I18n.tsx';
import type { Draft } from '../types/game.ts';
import { SpellPair } from '../components/SpellPair.tsx';
import { ComicHeading, GameButton, StickerLabel } from '../components/game/GameUI.tsx';

export function Spells({ draft, onSwap, onContinue }: { draft: Draft; onSwap: () => void; onContinue: () => void }) {
  const { t } = useI18n();
  return <section className="spells-page">
    <StickerLabel>{t.spells.eyebrow}</StickerLabel>
    <ComicHeading>{t.spells.title}</ComicHeading>
    <p className="intro">{t.spells.intro(draft.champion.name)}</p>
    <div className="dealing-table"><SpellPair spells={draft.spells} spellKeys={draft.spellKeys} expanded /><div className="spell-swap"><GameButton variant="secondary" onClick={onSwap}><span aria-hidden="true">⇄</span>{t.spells.swap}</GameButton><p className="quiet">{t.spells.swapHint}</p><span className="sr-only" role="status">{draft.spells.map((spell, index) => `${spell.name}: ${draft.spellKeys[index]}`).join(', ')}</span></div></div>
    <div className="spell-actions"><p className="quiet">{t.spells.note}</p><GameButton onClick={onContinue}>{t.spells.start}<span aria-hidden="true">→</span></GameButton></div>
  </section>;
}

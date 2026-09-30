import { useI18n } from '../i18n/I18n.tsx';
import type { Draft } from '../types/game.ts';
import { Artwork } from '../components/Artwork.tsx';
import { BuildTray } from '../components/BuildTray.tsx';
import { SpellPair } from '../components/SpellPair.tsx';
import { ComicHeading, GameButton, GamePanel, StickerLabel } from '../components/game/GameUI.tsx';
import { DiceMascot } from '../components/game/DiceMascot.tsx';

export function FinalBuild({ draft, onNewBuild, onChangeChampion }: { draft: Draft; onNewBuild: () => void; onChangeChampion: () => void }) {
  const { t, formatNumber } = useI18n();
  const items = draft.buildSlots.map(slot => slot.item);
  return <section className="final-page">
    <div className="result-intro"><div><StickerLabel tone="cyan">{t.final.eyebrow}</StickerLabel><ComicHeading accent={t.final.accent}>{t.final.title}</ComicHeading><p className="intro">{t.final.intro}</p></div><DiceMascot dialogue={t.mascot.final} className="result-mascot" /></div>
    <GamePanel className="result-board">
      <div className="result-player"><div className="final-champion"><Artwork src={draft.champion.icon} name={draft.champion.name} /><div><h2>{draft.champion.name}</h2><p>{draft.champion.title}</p></div></div><SpellPair spells={draft.spells} spellKeys={draft.spellKeys} /></div>
      <BuildTray items={items} />
      <p className="result-cost">{t.final.cost(formatNumber(items.reduce((total, item) => total + item.cost, 0)))}</p>
    </GamePanel>
    <div className="actions"><GameButton onClick={onNewBuild}>↻ {t.final.newBuild}</GameButton><GameButton variant="secondary" onClick={onChangeChampion}>← {t.final.change}</GameButton></div>
    <p className="menu-note">{t.final.note}</p>
  </section>;
}

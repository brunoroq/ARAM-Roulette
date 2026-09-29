import { useI18n } from '../i18n/I18n.tsx';
import type { Draft, RoundPool } from '../types/game.ts';
import { Artwork } from '../components/Artwork.tsx';
import { BuildTray } from '../components/BuildTray.tsx';
import { SpellPair } from '../components/SpellPair.tsx';
import { ComicHeading, GameButton, ResourcePips, StickerLabel, VersusBadge } from '../components/game/GameUI.tsx';
import { ItemCard } from '../components/game/ItemCard.tsx';
import { DiceMascot } from '../components/game/DiceMascot.tsx';

export function ItemDraft({ draft, buildSize, roundPool, rerollTotal, onChoose, onReroll }: { draft: Draft; buildSize: number; roundPool: RoundPool; rerollTotal: number; onChoose: (id: string, revision: number) => void; onReroll: (revision: number) => void }) {
  const { t } = useI18n();
  const roundCopy = t.draft[roundPool];
  return <section className={`draft-page pool-${roundPool}`}>
    <div className="draft-arena">
    <div className="draft-top"><div className="selected-champion"><Artwork src={draft.champion.icon} name={draft.champion.name} /><div><strong>{draft.champion.name}</strong><span>{t.draft.regret}</span></div></div><SpellPair spells={draft.spells} spellKeys={draft.spellKeys} /></div>
    <div className="draft-heading">
      <div><StickerLabel tone={roundPool === 'boots' ? 'cyan' : 'paper'}>{String(draft.items.length + 1).padStart(2, '0')} / {roundCopy.eyebrow}</StickerLabel><ComicHeading>{roundCopy.title}</ComicHeading></div>
      <div className="round-resources">
        <div className="progress" aria-live="polite">{t.draft.build} <strong>{draft.items.length + 1}</strong><span> / {buildSize}</span></div>
        <div className="reroll-meter"><span>{t.draft.rerolls}</span><ResourcePips remaining={draft.rerollsLeft} total={rerollTotal} label={t.draft.left(draft.rerollsLeft)} /></div>
      </div>
    </div>
    <p className="round-note">{roundCopy.note}</p>
    <div className="choices" key={draft.revision}>
      <ItemCard item={draft.choices[0]} onChoose={() => onChoose(draft.choices[0].id, draft.revision)} />
      <VersusBadge>{t.draft.versus}</VersusBadge>
      <ItemCard item={draft.choices[1]} onChoose={() => onChoose(draft.choices[1].id, draft.revision)} />
    </div>
    <div className="reroll-row">
      <GameButton variant="secondary" disabled={draft.rerollsLeft === 0} onClick={event => { if (event.detail < 2) onReroll(draft.revision); }}>↻ {t.draft.reroll}<span className="reroll-count">{t.draft.left(draft.rerollsLeft)}</span></GameButton>
      <span className="quiet">{draft.rerollsLeft ? t.draft.hopeful : t.draft.exhausted}</span>
      {draft.rerollsLeft === 0 && <DiceMascot mood="worried" className="resource-mascot" dialogue={t.mascot.empty} />}
    </div>
    </div>
    <div className="draft-inventory">
      <div className="tray-heading"><h2>{t.draft.damage}</h2><span className="quiet">{t.draft.lockedCount(draft.items.length, buildSize)}</span></div>
      <BuildTray items={draft.items} size={buildSize} />
    </div>
  </section>;
}

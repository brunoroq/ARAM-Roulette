import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18n.tsx';
import { isBoots } from '../engine/itemPool.ts';
import type { Draft, Item } from '../types/game.ts';
import { Artwork } from '../components/Artwork.tsx';
import { SpellPair } from '../components/SpellPair.tsx';
import { ComicHeading, GameButton, ResourcePips, StickerLabel } from '../components/game/GameUI.tsx';
import { DiceMascot } from '../components/game/DiceMascot.tsx';

export function ItemDraft({ draft, allItems, fullRerollTotal, individualRerollTotal, onRerollBuild, onReroll, onFinish }: {
  draft: Draft;
  allItems: readonly Item[];
  fullRerollTotal: number;
  individualRerollTotal: number;
  onRerollBuild: (revision: number) => boolean;
  onReroll: (index: number, revision: number) => boolean;
  onFinish: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // A reload during the last spin resumes with the committed result already visible.
  const resumedFinalizing = useRef(draft.status === 'finalizing').current;
  const [revealed, setRevealed] = useState(reducedMotion || resumedFinalizing ? draft.buildSlots.length : 0);
  const [revealRun, setRevealRun] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [spinning, setSpinning] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const busy = useRef(false);
  const rerollTimer = useRef<number | undefined>(undefined);
  const pools = useMemo(() => ({
    boots: allItems.filter(isBoots),
    standard: allItems.filter(item => !isBoots(item)),
  }), [allItems]);
  const revealing = revealed < draft.buildSlots.length;
  const animating = revealing || spinning !== null;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion || resumedFinalizing) {
      setRevealed(draft.buildSlots.length);
      setSpinning(null);
      window.clearTimeout(rerollTimer.current);
      busy.current = false;
      return;
    }
    const timers = draft.buildSlots.map((_, index) => window.setTimeout(() => setRevealed(index + 1), 600 + index * 220));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [draft.buildSlots.length, reducedMotion, revealRun, resumedFinalizing]);

  useEffect(() => {
    if (!animating || reducedMotion) return;
    let cancelled = false;
    let timer: number;
    let delay = 55;
    const advance = () => {
      if (cancelled) return;
      setTick(value => value + 1);
      delay = Math.min(180, delay + 9);
      timer = window.setTimeout(advance, delay);
    };
    timer = window.setTimeout(advance, delay);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [animating, reducedMotion]);

  useEffect(() => () => window.clearTimeout(rerollTimer.current), []);
  useEffect(() => { if (reducedMotion) busy.current = false; }, [draft.revision, reducedMotion]);
  useEffect(() => { if (!animating) busy.current = false; }, [animating]);
  useEffect(() => {
    if (draft.status !== 'finalizing' || animating) return;
    // Let the final replacement visibly land before leaving the build screen.
    const timer = window.setTimeout(onFinish, reducedMotion || resumedFinalizing ? 0 : 300);
    return () => window.clearTimeout(timer);
  }, [draft.status, animating, onFinish, reducedMotion, resumedFinalizing]);

  function rerollEverything() {
    if (busy.current || animating || draft.status !== 'editing' || draft.fullBuildRerollsLocked || draft.fullBuildRerollsLeft === 0) return;
    busy.current = true;
    if (!onRerollBuild(draft.revision)) { busy.current = false; return; } // Commit before animation.
    setSelected(null);
    if (reducedMotion) return;
    setTick(0);
    setRevealed(0);
    setRevealRun(value => value + 1);
  }

  function rerollSelected() {
    if (busy.current || animating || draft.status !== 'editing' || selected === null || draft.individualRerollsLeft === 0) return;
    busy.current = true;
    if (!onReroll(selected, draft.revision)) { busy.current = false; return; } // Commit before animation.
    if (reducedMotion) return;
    setSpinning(selected);
    rerollTimer.current = window.setTimeout(() => { setSpinning(null); busy.current = false; }, 850);
  }

  return <section className="draft-page roulette-page">
    <div className="draft-top"><div className="selected-champion"><Artwork src={draft.champion.icon} name={draft.champion.name} /><div><strong>{draft.champion.name}</strong><span>{t.draft.regret}</span></div></div><SpellPair spells={draft.spells} spellKeys={draft.spellKeys} /></div>
    <div className="draft-heading"><div><StickerLabel tone="pink">{t.draft.eyebrow}</StickerLabel><ComicHeading>{t.draft.title}</ComicHeading><p className="round-note">{revealing ? t.draft.revealing : t.draft.instruction}</p></div>
      <div className="reroll-bank">
        <div className="reroll-meter full-meter"><span>{t.draft.fullRerolls}</span><ResourcePips remaining={draft.fullBuildRerollsLocked ? 0 : draft.fullBuildRerollsLeft} total={fullRerollTotal} label={draft.fullBuildRerollsLocked ? t.draft.fullLocked : t.draft.left(draft.fullBuildRerollsLeft)} /><strong>{draft.fullBuildRerollsLocked ? t.draft.fullLocked : t.draft.left(draft.fullBuildRerollsLeft)}</strong></div>
        <div className="reroll-meter"><span>{t.draft.rerolls}</span><ResourcePips remaining={draft.individualRerollsLeft} total={individualRerollTotal} label={t.draft.left(draft.individualRerollsLeft)} /><strong>{t.draft.left(draft.individualRerollsLeft)}</strong></div>
      </div>
    </div>
    <div className="roulette-board" aria-label={t.draft.build}>
      {draft.buildSlots.map((slot, index) => {
        const showFinal = index < revealed && spinning !== index;
        const pool = pools[slot.pool];
        const decorative = pool[(tick * 17 + index * 13) % pool.length];
        return <button key={index} type="button" className={`roulette-slot ${slot.pool === 'boots' ? 'boot-slot' : ''} ${selected === index ? 'selected' : ''} ${!showFinal ? 'spinning' : ''}`}
          disabled={animating || draft.status === 'finalizing'} aria-pressed={selected === index} aria-label={!showFinal ? t.draft.revealingSlot(index + 1) : selected === index ? t.draft.deselectSlot(index + 1, slot.item.name) : t.draft.selectSlot(index + 1, slot.item.name)} onClick={() => setSelected(current => current === index ? null : index)}>
          <span className="roulette-slot-number">{t.draft.slot(index + 1)}{slot.pool === 'boots' && <em>{t.draft.boots}</em>}</span>
          <span className="roulette-window">{showFinal ? <Artwork src={slot.item.icon} name={slot.item.name} /> : tick > 0 && decorative ? <Artwork src={decorative.icon} name={decorative.name} /> : <span className="roulette-question" aria-hidden="true">?</span>}</span>
          <span className="roulette-item-name">{showFinal ? slot.item.name : t.draft.unknown}</span>
          <span className="roulette-item-cost">{showFinal ? t.draft.gold(formatNumber(slot.item.cost)) : <span aria-hidden="true">•••</span>}</span>
          {selected === index && showFinal && <span className="roulette-selected">{t.draft.selected}</span>}
        </button>;
      })}
    </div>
    <p className="sr-only" role="status">{revealing ? t.draft.revealing : spinning !== null ? t.draft.spinning : selected !== null ? t.draft.selectedItem(draft.buildSlots[selected].item.name) : t.draft.revealDone}</p>
    <div className={`roulette-controls ${draft.individualRerollsLeft === 0 ? 'has-mascot' : ''}`}><div className="roulette-actions"><GameButton variant="secondary" disabled={animating || draft.status !== 'editing' || draft.fullBuildRerollsLocked || draft.fullBuildRerollsLeft === 0} onClick={rerollEverything}>↻ {t.draft.fullReroll}</GameButton><GameButton variant="secondary" disabled={animating || draft.status !== 'editing' || selected === null || draft.individualRerollsLeft === 0} onClick={rerollSelected}>↻ {t.draft.reroll}</GameButton><GameButton disabled={animating || draft.status === 'finalizing'} onClick={onFinish}>{t.draft.finish} <span aria-hidden="true">→</span></GameButton></div>
      <span className="quiet">{draft.fullBuildRerollsLocked ? t.draft.committed : draft.fullBuildRerollsLeft === 0 ? t.draft.fullSpent : t.draft.commitHint} {draft.individualRerollsLeft > 0 && (selected === null ? t.draft.pickSlot : t.draft.gamble)}</span>
      {draft.individualRerollsLeft === 0 && <DiceMascot mood="worried" className="resource-mascot" dialogue={t.mascot.empty} />}
    </div>
    {selected !== null && !animating && <div className="roulette-details"><strong>{draft.buildSlots[selected].item.name}</strong><p>{draft.buildSlots[selected].item.description || t.draft.noDetails}</p><ul>{draft.buildSlots[selected].item.stats.map((stat, index) => <li key={index}>{stat}</li>)}</ul></div>}
  </section>;
}

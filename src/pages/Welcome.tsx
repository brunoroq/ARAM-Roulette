import { assets } from '../assets.ts';
import { useI18n } from '../i18n/I18n.tsx';
import { GameButton, StickerLabel } from '../components/game/GameUI.tsx';
import { DiceMascot } from '../components/game/DiceMascot.tsx';

export function Welcome({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  return <section className="welcome">
    <div className="title-stage">
      <StickerLabel tone="cyan">{t.welcome.eyebrow}</StickerLabel>
      <h1 className="title-logo"><img src={assets.logoMain} alt={t.app.title} /></h1>
      <p className="title-tagline">{t.welcome.tagline}</p>
      <p className="intro">{t.welcome.intro}</p>
      <div className="menu-action"><GameButton onClick={onStart}>{t.welcome.start}<span aria-hidden="true">→</span></GameButton><span className="doodle-arrow" aria-hidden="true">↶</span></div>
      <p className="menu-note">{t.welcome.note}</p>
    </div>
    <div className="instruction-stage">
      <div className="instruction-sheet">
        <img className="rules-paper" src={assets.rulesPaper} alt="" />
        <StickerLabel tone="pink">{t.welcome.rulesTitle}</StickerLabel>
        <ol className="rules-list">{t.welcome.rules.map((rule, index) => <li key={index}><span>{index + 1}</span>{rule}</li>)}</ol>
        <span className="paper-scribble" aria-hidden="true">× × ×</span>
      </div>
      <DiceMascot className="welcome-mascot" dialogue={t.mascot.welcome} />
    </div>
  </section>;
}

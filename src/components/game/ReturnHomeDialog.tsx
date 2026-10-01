import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/I18n.tsx';
import { GameButton } from './GameUI.tsx';

export function ReturnHomeDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  return <dialog ref={dialog} className="return-home-dialog" aria-labelledby="return-home-title" aria-describedby="return-home-message"
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="return-home-title">{t.app.returnHomeTitle}</h2>
    <p id="return-home-message">{t.app.returnHomeMessage}</p>
    <div className="return-home-dialog-actions">
      <GameButton variant="secondary" onClick={onCancel}>{t.app.cancel}</GameButton>
      <GameButton variant="danger" onClick={onConfirm}><span aria-hidden="true">←</span> {t.app.returnHome}</GameButton>
    </div>
  </dialog>;
}

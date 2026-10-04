import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { GameButton } from './GameUI.tsx';

/** Modal confirmation in the app's paper style. Escape counts as cancel. */
export function ConfirmDialog({ id, title, message, cancelLabel, confirmLabel, onCancel, onConfirm, extra }: {
  id: string; title: string; message: string; cancelLabel: ReactNode; confirmLabel: ReactNode; onCancel: () => void; onConfirm: () => void;
  /** An optional third, non-destructive choice. */
  extra?: { label: ReactNode; onClick: () => void };
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  return <dialog ref={dialog} className="return-home-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-message`}
    onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={`${id}-title`}>{title}</h2>
    <p id={`${id}-message`}>{message}</p>
    <div className="return-home-dialog-actions">
      <GameButton variant="secondary" onClick={onCancel}>{cancelLabel}</GameButton>
      {extra && <GameButton onClick={extra.onClick}>{extra.label}</GameButton>}
      <GameButton variant="danger" onClick={onConfirm}>{confirmLabel}</GameButton>
    </div>
  </dialog>;
}

import { useI18n } from '../../i18n/I18n.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';

export function ReturnHomeDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  return <ConfirmDialog id="return-home" title={t.app.returnHomeTitle} message={t.app.returnHomeMessage}
    cancelLabel={t.app.cancel} confirmLabel={<><span aria-hidden="true">←</span> {t.app.returnHome}</>} onCancel={onCancel} onConfirm={onConfirm} />;
}

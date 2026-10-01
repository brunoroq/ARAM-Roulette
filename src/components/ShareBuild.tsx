import { useEffect, useRef, useState } from 'react';
import type { Draft } from '../types/game.ts';
import { useI18n } from '../i18n/I18n.tsx';
import { GameButton } from './game/GameUI.tsx';
import { shareModel } from '../share/model.ts';
import { renderShareCard } from '../share/render.ts';
import { copyShareImage, saveShareImage } from '../share/output.ts';

type Status = 'idle' | 'working' | 'copied' | 'fallback' | 'saved' | 'cancelled' | 'error';
export function ShareBuild({ draft }: { draft: Draft }) {
  const { t, language } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const [status, setStatus] = useState<Status>('idle');
  const [download, setDownload] = useState<{ png: Blob; filename: string } | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (status !== 'copied' && status !== 'saved') return;
    const timer = window.setTimeout(() => setStatus('idle'), 3000);
    return () => clearTimeout(timer);
  }, [status]);
  const update = (next: Status) => { if (mounted.current) setStatus(next); };
  async function share() {
    if (busy.current || !canvas.current) return;
    busy.current = true; update('working');
    try {
      const model = shareModel(draft);
      const png = await renderShareCard(canvas.current, model, t, language);
      if (!mounted.current) return;
      setDownload({ png, filename: model.filename });
      try { await copyShareImage(png); update('copied'); }
      catch { update('fallback'); }
    } catch { update('error'); }
    finally { busy.current = false; }
  }
  async function save() {
    if (busy.current || !download) return;
    busy.current = true; update('working');
    try { update(await saveShareImage(download.png, download.filename) ? 'saved' : 'cancelled'); }
    catch { update('error'); }
    finally { busy.current = false; }
  }
  return <div className="share-build">
    <GameButton className="share-button" variant="secondary" disabled={status === 'working'} onClick={share}>
      <span aria-hidden="true">↗</span>{status === 'copied' ? t.share.copied : status === 'working' ? t.share.working : t.share.button}
    </GameButton>
    {download && <button className="share-save" disabled={status === 'working'} onClick={save}>{t.share.save}</button>}
    <span className="share-status" role="status" aria-live="polite">{status === 'idle' ? '' : t.share[status]}</span>
    <canvas ref={canvas} hidden aria-hidden="true" />
  </div>;
}

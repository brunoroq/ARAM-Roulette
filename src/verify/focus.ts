import { isTauri } from '@tauri-apps/api/core';

/**
 * Calls `onFocus` when the player comes back to the app: the desktop window regains focus
 * (Tauri's window focus event), or the page becomes visible/focused again. Bursts of events
 * are expected; callers rate-limit. Returns an unsubscribe function.
 */
export function subscribeAppFocus(onFocus: () => void): () => void {
  let disposed = false;
  let unlistenWindow: (() => void) | undefined;
  const onVisible = () => { if (document.visibilityState === 'visible') onFocus(); };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisible);
  if (isTauri()) {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().onFocusChanged(({ payload: focused }) => { if (focused) onFocus(); }))
      .then(unlisten => { if (disposed) unlisten(); else unlistenWindow = unlisten; })
      .catch(() => { /* DOM focus events still apply. */ });
  }
  return () => {
    disposed = true;
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
    unlistenWindow?.();
  };
}

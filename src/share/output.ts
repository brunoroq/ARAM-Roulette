import { isTauri } from '@tauri-apps/api/core';

export async function copyShareImage(png: Blob): Promise<void> {
  if (isTauri()) {
    const [{ Image }, { writeImage }] = await Promise.all([
      import('@tauri-apps/api/image'), import('@tauri-apps/plugin-clipboard-manager'),
    ]);
    const image = await Image.fromBytes(await png.arrayBuffer());
    try { await writeImage(image); } finally { await image.close(); }
    return;
  }
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard unavailable');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

/** Native dialog grants access only to the selected path; cancellation is not success. */
export async function saveShareImage(png: Blob, filename: string): Promise<boolean> {
  if (isTauri()) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({ defaultPath: filename, filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await png.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(png);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  // Give browsers time to start the download before releasing its source.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

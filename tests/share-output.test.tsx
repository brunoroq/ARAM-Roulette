// @vitest-environment happy-dom
import { beforeEach, expect, test, vi } from 'vitest';
import { copyShareImage, saveShareImage } from '../src/share/output.ts';
const mocks = vi.hoisted(() => ({
  isTauri: vi.fn(() => true), fromBytes: vi.fn(), writeImage: vi.fn(), close: vi.fn(),
  save: vi.fn(), writeFile: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }));
vi.mock('@tauri-apps/api/image', () => ({ Image: { fromBytes: mocks.fromBytes } }));
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeImage: mocks.writeImage }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mocks.writeFile }));
const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
beforeEach(() => {
  vi.resetAllMocks(); mocks.isTauri.mockReturnValue(true);
  mocks.fromBytes.mockResolvedValue({ close: mocks.close });
});
test('native image resources are released after copy success and failure', async () => {
  await copyShareImage(png);
  expect(mocks.writeImage).toHaveBeenCalledWith({ close: mocks.close });
  expect(mocks.close).toHaveBeenCalledTimes(1);
  mocks.writeImage.mockRejectedValueOnce(new Error('clipboard busy'));
  await expect(copyShareImage(png)).rejects.toThrow('clipboard busy');
  expect(mocks.close).toHaveBeenCalledTimes(2);
});
test('native save writes exact PNG bytes only to the path selected by the user', async () => {
  mocks.save.mockResolvedValue('C:\\Users\\Player\\Desktop\\build.png');
  expect(await saveShareImage(png, 'aram-roulette-akshan-build.png')).toBe(true);
  expect(mocks.save).toHaveBeenCalledWith({ defaultPath: 'aram-roulette-akshan-build.png', filters: [{ name: 'PNG', extensions: ['png'] }] });
  expect(mocks.writeFile).toHaveBeenCalledWith('C:\\Users\\Player\\Desktop\\build.png', new Uint8Array([137,80,78,71]));
  mocks.save.mockResolvedValue(null);
  expect(await saveShareImage(png, 'build.png')).toBe(false);
  expect(mocks.writeFile).toHaveBeenCalledTimes(1);
});
test('native disk errors propagate instead of reporting a successful export', async () => {
  mocks.save.mockResolvedValue('C:\\build.png');
  mocks.writeFile.mockRejectedValue(new Error('disk full'));
  await expect(saveShareImage(png, 'build.png')).rejects.toThrow('disk full');
});

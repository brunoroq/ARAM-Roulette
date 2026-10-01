// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ShareBuild } from '../src/components/ShareBuild.tsx';
import { I18nProvider } from '../src/i18n/I18n.tsx';
import { gameData, rules } from '../src/data/index.ts';
import { createDraft, generateBuild, finalizeBuild } from '../src/engine/draft.ts';
import { renderShareCard } from '../src/share/render.ts';
import { copyShareImage, saveShareImage } from '../src/share/output.ts';
vi.mock('../src/share/render.ts', () => ({ renderShareCard: vi.fn() }));
vi.mock('../src/share/output.ts', () => ({ copyShareImage: vi.fn(), saveShareImage: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
const draft = finalizeBuild(generateBuild(createDraft(gameData.champions[0], { data: gameData, rules, random: () => 0 }), { data: gameData, rules, random: () => 0 }));
const png = new Blob(['PNG'], { type: 'image/png' });
async function click(selector: string) { await act(async () => { document.querySelector<HTMLButtonElement>(selector)!.click(); }); }
beforeEach(async () => {
  vi.useFakeTimers(); vi.resetAllMocks();
  vi.mocked(renderShareCard).mockResolvedValue(png);
  vi.mocked(copyShareImage).mockResolvedValue();
  vi.mocked(saveShareImage).mockResolvedValue(true);
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById('root')!);
  await act(async () => { root.render(<I18nProvider><ShareBuild draft={draft} /></I18nProvider>); });
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
test('successful copy gives temporary feedback and exports only from a hidden canvas', async () => {
  await click('.share-button');
  expect(copyShareImage).toHaveBeenCalledWith(png);
  expect(document.querySelector('.share-button')!.textContent).toContain('COPIED!');
  expect(document.querySelector('canvas')!.hidden).toBe(true);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(document.querySelector('.share-button')!.textContent).toContain('SHARE BUILD');
});
test('clipboard failure offers PNG saving, handles cancellation and retry without regenerating', async () => {
  vi.mocked(copyShareImage).mockRejectedValue(new Error('denied'));
  await click('.share-button');
  expect(document.querySelector('[role=status]')!.textContent).toContain('Save the PNG');
  vi.mocked(saveShareImage).mockResolvedValueOnce(false);
  await click('.share-save');
  expect(document.querySelector('[role=status]')!.textContent).toContain('cancelled');
  await click('.share-save');
  expect(saveShareImage).toHaveBeenCalledWith(png, expect.stringMatching(/^aram-roulette-.*-build.png$/));
  expect(document.querySelector('[role=status]')!.textContent).toContain('exported');
  expect(renderShareCard).toHaveBeenCalledTimes(1);
});
test('render failure is announced and busy clicks cannot duplicate export', async () => {
  let fail!: (error: Error) => void;
  vi.mocked(renderShareCard).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  await click('.share-button'); await click('.share-button');
  expect(renderShareCard).toHaveBeenCalledTimes(1);
  await act(async () => fail(new Error('asset unavailable')));
  expect(document.querySelector('[role=status]')!.textContent).toContain('try again');
  expect(copyShareImage).not.toHaveBeenCalled();
});

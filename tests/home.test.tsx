// @vitest-environment happy-dom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { I18nProvider } from '../src/i18n/I18n.tsx';
import { languageStorageKey } from '../src/i18n/locale.ts';
import { gameData, rules } from '../src/data/index.ts';
import { createDraft, finalizeBuild, generateBuild, rerollSlot } from '../src/engine/draft.ts';
import { serializeSession, sessionStorageKey } from '../src/session.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Node 26's experimental global localStorage is unavailable in this test process.
const stored = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
  clear: () => { stored.clear(); },
} });
const context = { data: gameData, rules, random: () => 0 };
let root: Root;

async function render() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<StrictMode><I18nProvider><App /></I18nProvider></StrictMode>); });
}

function button(label: string) {
  const match = [...document.querySelectorAll('button')].find(element => element.textContent?.trim().includes(label));
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

async function click(label: string) {
  await act(async () => { button(label).click(); });
}

async function confirmHome() {
  await act(async () => { document.querySelector<HTMLButtonElement>('dialog .game-button.danger')!.click(); });
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

test('returning home during the reveal cancels cleanly and the next session starts fresh', async () => {
  const firstBuild = generateBuild(createDraft(gameData.champions[0]!, context), context);
  const draft = rerollSlot(firstBuild, 0, firstBuild.revision, context);
  expect(draft.fullBuildRerollsLocked).toBe(true);
  const saved = serializeSession({ page: 'draft', draft });
  localStorage.setItem(sessionStorageKey, saved);
  await render();

  expect(document.querySelectorAll('.roulette-slot.spinning').length).toBeGreaterThan(0);
  expect(button('RETURN TO HOME').disabled).toBe(false);
  await click('RETURN TO HOME');
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  expect(localStorage.getItem(sessionStorageKey)).toBe(saved);
  await click('CANCEL');
  expect(document.querySelector('dialog')).toBeNull();
  expect(localStorage.getItem(sessionStorageKey)).toBe(saved);

  await click('RETURN TO HOME');
  await confirmHome();
  expect(document.querySelector('.welcome')).not.toBeNull();
  expect(localStorage.getItem(sessionStorageKey)).toBeNull();

  await act(async () => { await new Promise(resolve => setTimeout(resolve, 2100)); });
  expect(document.querySelector('.welcome')).not.toBeNull();
  expect(localStorage.getItem(sessionStorageKey)).toBeNull();

  await click('LET’S GAMBLE!');
  expect(button('START ROULETTE').disabled).toBe(true);
  await act(async () => { document.querySelector<HTMLButtonElement>('.champion-card')!.click(); });
  await click('START ROULETTE');
  const fresh = JSON.parse(localStorage.getItem(sessionStorageKey)!);
  expect(fresh.page).toBe('spells');
  expect(fresh.fullBuildRerollsLeft).toBe(rules.fullBuildRerolls);
  expect(fresh.individualRerollsLeft).toBe(rules.individualRerolls);
  expect(fresh.fullBuildRerollsLocked).toBe(false);
  expect(fresh.itemIds).toEqual([]);
  await click('REVEAL MY BUILD');
  expect(document.querySelectorAll('.roulette-slot')).toHaveLength(6);
  expect(JSON.parse(localStorage.getItem(sessionStorageKey)!).page).toBe('draft');
});

test('returning home during an individual reroll clears its pending animation timer', async () => {
  const draft = generateBuild(createDraft(gameData.champions[0]!, context), context);
  localStorage.setItem(sessionStorageKey, serializeSession({ page: 'draft', draft }));
  await render();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1800)); });

  await act(async () => { document.querySelector<HTMLButtonElement>('.roulette-slot')!.click(); });
  const scheduled = vi.spyOn(window, 'setTimeout');
  await click('REROLL THIS');
  const spinTimer = scheduled.mock.results.find((_, index) => scheduled.mock.calls[index]?.[1] === 850)?.value;
  expect(spinTimer).toBeDefined();
  expect(document.querySelectorAll('.roulette-slot.spinning')).toHaveLength(1);

  const cleared = vi.spyOn(window, 'clearTimeout');
  await click('RETURN TO HOME');
  await confirmHome();
  expect(cleared).toHaveBeenCalledWith(spinTimer);
  expect(localStorage.getItem(sessionStorageKey)).toBeNull();
  expect(document.querySelector('.welcome')).not.toBeNull();
});

test('returning home after finalization clears the saved result; cancellation keeps it', async () => {
  const draft = finalizeBuild(generateBuild(createDraft(gameData.champions[0]!, context), context));
  const saved = serializeSession({ page: 'result', draft });
  localStorage.setItem(sessionStorageKey, saved);
  localStorage.setItem(languageStorageKey, 'es');
  await render();

  expect(document.querySelector('.final-page')).not.toBeNull();
  await click('VOLVER AL INICIO');
  expect(document.querySelector('dialog[open]')).not.toBeNull();
  expect(document.querySelector('dialog')!.textContent).toContain('perderás el campeón');
  await click('CANCELAR');
  expect(document.querySelector('.final-page')).not.toBeNull();
  expect(localStorage.getItem(sessionStorageKey)).toBe(saved);

  await click('VOLVER AL INICIO');
  await confirmHome();
  expect(document.querySelector('.welcome')).not.toBeNull();
  expect(localStorage.getItem(sessionStorageKey)).toBeNull();
});

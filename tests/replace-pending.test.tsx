// @vitest-environment happy-dom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { I18nProvider } from '../src/i18n/I18n.tsx';
import { gameData, rules } from '../src/data/index.ts';
import { createDraft, generateBuild, rerollSlot } from '../src/engine/draft.ts';
import type { Draft } from '../src/types/game.ts';
import { serializeSession, sessionStorageKey } from '../src/session.ts';
import { challengeStorageKey, historyStorageKey, parseChallenge, parseHistory, serializeHistory } from '../src/verify/challenge.ts';
import type { LcuRead, LockedChallenge, VerifiedRun } from '../src/verify/types.ts';

const lcu = vi.hoisted(() => ({ read: vi.fn<(since: number) => Promise<LcuRead>>() }));
vi.mock('../src/verify/lcu.ts', () => ({ readRecentMayhemGames: lcu.read }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const stored = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); },
  clear: () => { stored.clear(); },
} });
// Reduced motion reveals the build at once, so LOCK IT IN is immediately available.
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });

const context = { data: gameData, rules, random: () => 0 };
const ITEMS = ['6696', '3158', '3146', '3091', '6655', '126697'];
const pending: LockedChallenge = {
  schema: 1, id: 'old-challenge', lockedAt: 1000, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, status: 'pending',
};
const pastRun: VerifiedRun = {
  challengeId: 'past', lockedAt: 10, gameId: 77, gameCreation: 20, verifiedAt: 30, championId: 'Jinx', championKey: 222,
  lockedSpellIds: [4, 7], actualSpellIds: [4, 7], challengeItemIds: ITEMS, finalItemIds: [0, 0, 0, 0, 0, 0], completedItemIds: [], win: false,
};
const realGame: LcuRead = { status: 'ok', games: [{
  gameId: 1628325258, gameCreation: 2000, queueId: 2400, mapId: 12, gameMode: 'KIWI',
  player: { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: [6696, 3146, 3158, 3091, 1036, 0, 2052], augments: [1029] },
}] };
let root: Root | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function editingDraft(): Draft {
  return generateBuild(createDraft(gameData.champions.find(champion => champion.id === 'Garen')!, context), context);
}
function seed({ challenge = pending as LockedChallenge | null, draft = editingDraft() } = {}) {
  if (challenge) localStorage.setItem(challengeStorageKey, JSON.stringify(challenge));
  localStorage.setItem(historyStorageKey, serializeHistory([pastRun]));
  localStorage.setItem(sessionStorageKey, serializeSession({ page: 'draft', draft }));
  return draft;
}
async function mountApp() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<StrictMode><I18nProvider><App /></I18nProvider></StrictMode>); });
}
const settle = (ms = 0) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
function button(label: string) {
  const match = [...document.querySelectorAll('button')].find(element => element.textContent?.trim().includes(label));
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
const click = (label: string) => act(async () => { button(label).click(); });
const dialog = () => document.querySelector('dialog#replace-run, dialog[aria-labelledby="replace-run-title"]');
const storedChallenge = () => parseChallenge(localStorage.getItem(challengeStorageKey));
const history = () => parseHistory(localStorage.getItem(historyStorageKey));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  lcu.read.mockReset();
  lcu.read.mockResolvedValue({ status: 'ok', games: [] });
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

test('1. with no pending challenge, LOCK IT IN locks immediately', async () => {
  seed({ challenge: null });
  await mountApp();
  await click('LOCK IT IN');
  expect(dialog()).toBeNull();
  expect(document.querySelector('.final-page')).not.toBeNull();
  expect(storedChallenge()?.status).toBe('pending');
  expect(history()).toEqual([pastRun]);
});

test('2–4. a pending challenge asks first; KEEP PENDING RUN changes nothing', async () => {
  const draft = seed();
  await mountApp();
  await settle(); // Startup check: no game yet.
  const session = localStorage.getItem(sessionStorageKey);
  const reads = lcu.read.mock.calls.length;
  await click('LOCK IT IN');

  expect(dialog()).not.toBeNull();
  expect(dialog()!.textContent).toContain('REPLACE PENDING RUN?');
  expect(dialog()!.textContent).toContain('You already have a challenge waiting to be verified.');
  expect(document.querySelector('.draft-page')).not.toBeNull();
  expect(storedChallenge()).toEqual(pending);

  await click('KEEP PENDING RUN');
  expect(dialog()).toBeNull();
  expect(storedChallenge()).toEqual(pending);
  expect(history()).toEqual([pastRun]);
  expect(localStorage.getItem(sessionStorageKey)).toBe(session);
  expect(document.querySelector('.draft-page')).not.toBeNull();
  expect([...document.querySelectorAll('.roulette-item-name')].map(slot => slot.textContent)).toEqual(draft.buildSlots.map(slot => slot.item.name));
  expect(lcu.read.mock.calls.length).toBe(reads);
});

test('5–7. REPLACE & LOCK IN replaces only the pending challenge', async () => {
  const draft = seed();
  await mountApp();
  await settle();
  const before = Date.now();
  await click('LOCK IT IN');
  await click('REPLACE & LOCK IN');

  expect(dialog()).toBeNull();
  expect(document.querySelector('.final-page')).not.toBeNull();
  const replaced = storedChallenge()!;
  expect(replaced.id).not.toBe(pending.id);
  expect(replaced.lockedAt).toBeGreaterThanOrEqual(before);
  expect(replaced).toMatchObject({ status: 'pending', championId: 'Garen', itemIds: draft.buildSlots.map(slot => slot.item.id) });
  expect(history()).toEqual([pastRun]);
});

test('10. repeated clicks perform a single replacement', async () => {
  seed();
  await mountApp();
  await settle();
  const uuid = vi.spyOn(globalThis.crypto, 'randomUUID');
  await click('LOCK IT IN');
  const confirm = button('REPLACE & LOCK IN');
  await act(async () => { confirm.click(); confirm.click(); confirm.click(); });
  expect(uuid).toHaveBeenCalledTimes(1);
  expect(storedChallenge()?.id).not.toBe(pending.id);
});

test('8–9. a verification finishing under the prompt keeps its run and is not undone', async () => {
  const gate = deferred<LcuRead>();
  lcu.read.mockReturnValue(gate.promise);
  seed();
  await mountApp(); // Startup check is now in flight.
  await click('LOCK IT IN');
  expect(dialog()).not.toBeNull();

  await act(async () => { gate.resolve(realGame); });
  await settle();
  // The old run verified: history has it, and the prompt closed with nothing to replace.
  expect(history().map(run => run.gameId)).toEqual([77, 1628325258]);
  expect(storedChallenge()).toMatchObject({ id: pending.id, status: 'verified' });
  expect(dialog()).toBeNull();
  expect(document.querySelector('.verify-banner')?.textContent).toContain('VICTORY');

  // Locking now proceeds without a prompt and never touches history.
  await click('LOCK IT IN');
  expect(dialog()).toBeNull();
  expect(storedChallenge()).toMatchObject({ status: 'pending', championId: 'Garen' });
  expect(storedChallenge()?.id).not.toBe(pending.id);
  expect(history().map(run => run.gameId)).toEqual([77, 1628325258]);
});

test('a check still in flight when the player replaces cannot overwrite the new challenge', async () => {
  const gate = deferred<LcuRead>();
  lcu.read.mockReturnValue(gate.promise);
  seed();
  await mountApp();
  await click('LOCK IT IN');
  await click('REPLACE & LOCK IN');
  const replaced = storedChallenge()!;
  await act(async () => { gate.resolve(realGame); });
  await settle();
  expect(storedChallenge()).toEqual(replaced);
  expect(history()).toEqual([pastRun]);
});

test('a finalizing build waits after KEEP PENDING RUN and can still be locked on purpose', async () => {
  let draft = editingDraft();
  for (const slot of [0, 2, 3]) draft = rerollSlot(draft, slot, draft.revision, context);
  expect(draft.status).toBe('finalizing');
  seed({ draft });
  await mountApp();
  await settle(20); // The finalizing build tries to lock itself in.
  expect(dialog()).not.toBeNull();
  await click('KEEP PENDING RUN');
  await settle(400);
  expect(dialog()).toBeNull(); // No automatic re-prompt.
  expect(storedChallenge()).toEqual(pending);
  expect(button('LOCK IT IN').disabled).toBe(false);
  await click('LOCK IT IN');
  expect(dialog()).not.toBeNull();
});

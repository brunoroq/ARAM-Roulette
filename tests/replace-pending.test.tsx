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
import { historyStorageKey, parseHistory, parseQueue, queueStorageKey, serializeHistory, serializeQueue } from '../src/verify/challenge.ts';
import { runStatus } from '../src/verify/queue.ts';
import type { ActiveRead, LcuRead, LockedChallenge, RunQueue, VerifiedRun } from '../src/verify/types.ts';

const lcu = vi.hoisted(() => ({
  read: vi.fn<(since: number, gameIds: readonly number[]) => Promise<LcuRead>>(),
  active: vi.fn<() => Promise<ActiveRead>>(),
}));
vi.mock('../src/verify/lcu.ts', () => ({ readRecentMayhemGames: lcu.read, readActiveGame: lcu.active }));

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
const run = (id: string, lockedAt: number, extra: Partial<LockedChallenge> = {}): LockedChallenge =>
  ({ schema: 2, id, lockedAt, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, ...extra });
const waiting = run('waiting', 1000);
const pastRun: VerifiedRun = {
  challengeId: 'past', lockedAt: 10, gameId: 77, gameCreation: 20, verifiedAt: 30, championId: 'Jinx', championKey: 222,
  lockedSpellIds: [4, 7], actualSpellIds: [4, 7], challengeItemIds: ITEMS, finalItemIds: [0, 0, 0, 0, 0, 0], completedItemIds: [], win: false,
};
const realGame: LcuRead = { status: 'ok', games: [{
  gameId: 1628325258, gameCreation: 2000, queueId: 2400, mapId: 12, gameMode: 'KIWI',
  player: { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: [6696, 3146, 3158, 3091, 1036, 0, 2052], augments: [1029] },
}] };
const inMatch = (gameId: number): ActiveRead => ({ status: 'ok', active: { gameId, queueId: 2400 } });
let root: Root | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function editingDraft(): Draft {
  return generateBuild(createDraft(gameData.champions.find(champion => champion.id === 'Garen')!, context), context);
}
function seed({ runQueue = { runs: [waiting], claimedGameIds: [] } as RunQueue, draft = editingDraft() } = {}) {
  localStorage.setItem(queueStorageKey, serializeQueue(runQueue));
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
const dialog = () => document.querySelector('dialog[aria-labelledby="replace-run-title"]');
const queue = () => parseQueue(localStorage.getItem(queueStorageKey));
const history = () => parseHistory(localStorage.getItem(historyStorageKey));
const newest = () => queue().runs.at(-1)!;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  lcu.read.mockReset();
  lcu.read.mockResolvedValue({ status: 'ok', games: [] });
  lcu.active.mockReset();
  lcu.active.mockResolvedValue({ status: 'ok', active: null });
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

test('with no run waiting, LOCK IT IN locks at once and binds a Mayhem match in progress', async () => {
  seed({ runQueue: { runs: [], claimedGameIds: [] } });
  lcu.active.mockResolvedValue(inMatch(501));
  await mountApp();
  await click('LOCK IT IN');
  await settle();
  expect(dialog()).toBeNull();
  expect(document.querySelector('.final-page')).not.toBeNull();
  expect(newest()).toMatchObject({ championId: 'Garen', activeGameId: 501 });
  expect(queue().claimedGameIds).toEqual([501]);
  expect(document.body.textContent).toContain('Linked to the Mayhem match you were playing when you locked in.');
  expect(history()).toEqual([pastRun]);
});

test('a run bound to a match is not "waiting": locking again adds a run that cannot claim that match', async () => {
  seed({ runQueue: { runs: [run('bound', 1000, { activeGameId: 501 })], claimedGameIds: [501] } });
  lcu.active.mockResolvedValue(inMatch(501)); // Still in the same match.
  await mountApp();
  await click('LOCK IT IN');
  await settle();
  expect(dialog()).toBeNull();
  expect(queue().runs.map(entry => [entry.id === 'bound' ? 'bound' : 'new', entry.activeGameId])).toEqual([['bound', 501], ['new', undefined]]);
});

test('with a run waiting, LOCK IT IN asks first; CANCEL changes nothing', async () => {
  const draft = seed();
  await mountApp();
  await settle();
  const session = localStorage.getItem(sessionStorageKey);
  const before = { reads: lcu.read.mock.calls.length, active: lcu.active.mock.calls.length };
  await click('LOCK IT IN');
  expect(dialog()!.textContent).toContain('A RUN IS ALREADY WAITING');
  expect(dialog()!.textContent).toContain('this build can’t claim a match already in progress');
  await click('CANCEL');
  expect(dialog()).toBeNull();
  expect(queue().runs).toEqual([waiting]);
  expect(history()).toEqual([pastRun]);
  expect(localStorage.getItem(sessionStorageKey)).toBe(session);
  expect([...document.querySelectorAll('.roulette-item-name')].map(slot => slot.textContent)).toEqual(draft.buildSlots.map(slot => slot.item.name));
  expect({ reads: lcu.read.mock.calls.length, active: lcu.active.mock.calls.length }).toEqual(before);
});

test('REPLACE & LOCK IN replaces only the waiting run and never claims a match in progress', async () => {
  const draft = seed({ runQueue: { runs: [waiting, run('bound', 900, { activeGameId: 400 })], claimedGameIds: [400] } });
  lcu.active.mockResolvedValue(inMatch(502)); // The waiting run may have been waiting for exactly this match.
  await mountApp();
  await settle();
  const before = Date.now();
  await click('LOCK IT IN');
  await click('REPLACE & LOCK IN');
  await settle();
  expect(document.querySelector('.final-page')).not.toBeNull();
  const runs = queue().runs;
  expect(runs.map(entry => entry.id)).not.toContain('waiting');
  expect(runs.find(entry => entry.id === 'bound')).toBeDefined();
  const replaced = newest();
  expect(replaced).toMatchObject({ championId: 'Garen', itemIds: draft.buildSlots.map(slot => slot.item.id) });
  expect(replaced.id).not.toBe('waiting');
  expect(replaced.lockedAt).toBeGreaterThanOrEqual(before);
  expect(replaced.activeGameId).toBeUndefined();
  expect(queue().claimedGameIds).toContain(502);
  expect(history()).toEqual([pastRun]);
});

test('ADD FOR NEXT MATCH keeps the waiting run and queues the new one behind it', async () => {
  seed();
  lcu.active.mockResolvedValue(inMatch(503));
  await mountApp();
  await settle();
  await click('LOCK IT IN');
  await click('ADD FOR NEXT MATCH');
  await settle();
  const runs = queue().runs;
  expect(runs.map(entry => entry.id === 'waiting' ? 'waiting' : 'new')).toEqual(['waiting', 'new']);
  expect(runs.every(entry => runStatus(entry) === 'pending' && entry.activeGameId === undefined)).toBe(true);
  expect(history()).toEqual([pastRun]);
});

test('repeated clicks lock a single run', async () => {
  seed();
  await mountApp();
  await settle();
  const uuid = vi.spyOn(globalThis.crypto, 'randomUUID');
  await click('LOCK IT IN');
  const confirm = button('REPLACE & LOCK IN');
  await act(async () => { confirm.click(); confirm.click(); button('ADD FOR NEXT MATCH').click(); });
  expect(uuid).toHaveBeenCalledTimes(1);
  expect(queue().runs).toHaveLength(1);
});

test('the waiting run resolving under the prompt keeps its result, closes the prompt, and is not undone', async () => {
  const gate = deferred<LcuRead>();
  lcu.read.mockReturnValue(gate.promise);
  seed();
  await mountApp(); // Startup check is in flight.
  await click('LOCK IT IN');
  expect(dialog()).not.toBeNull();
  await act(async () => { gate.resolve(realGame); });
  await settle();
  expect(history().map(entry => entry.gameId)).toEqual([77, 1628325258]);
  expect(runStatus(queue().runs[0]!)).toBe('verified');
  expect(dialog()).toBeNull();
  await click('LOCK IT IN');
  await settle();
  expect(dialog()).toBeNull();
  expect(queue().runs.map(entry => runStatus(entry))).toEqual(['verified', 'pending']);
  expect(history().map(entry => entry.gameId)).toEqual([77, 1628325258]);
});

test('a check still in flight when the waiting run is replaced cannot resurrect it or claim its game for the new run', async () => {
  const gate = deferred<LcuRead>();
  lcu.read.mockReturnValue(gate.promise);
  seed();
  await mountApp();
  await click('LOCK IT IN');
  await click('REPLACE & LOCK IN');
  await settle();
  const replaced = newest();
  await act(async () => { gate.resolve(realGame); }); // Created before the new lock: not the new run's game.
  await settle();
  expect(queue().runs).toEqual([replaced]);
  expect(history()).toEqual([pastRun]);
});

test('a finalizing build waits after CANCEL and can still be locked on purpose', async () => {
  let draft = editingDraft();
  for (const slot of [0, 2, 3]) draft = rerollSlot(draft, slot, draft.revision, context);
  expect(draft.status).toBe('finalizing');
  seed({ draft });
  await mountApp();
  await settle(20);
  expect(dialog()).not.toBeNull();
  await click('CANCEL');
  await settle(400);
  expect(dialog()).toBeNull();
  expect(queue().runs).toEqual([waiting]);
  expect(button('LOCK IT IN').disabled).toBe(false);
  await click('LOCK IT IN');
  expect(dialog()).not.toBeNull();
});

// @vitest-environment happy-dom
import { StrictMode, act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { RunCheck } from '../src/components/RunCheck.tsx';
import { I18nProvider } from '../src/i18n/I18n.tsx';
import { subscribeAppFocus } from '../src/verify/focus.ts';
import { lockOrder, runStatus } from '../src/verify/queue.ts';
import type { ActiveRead, LcuRead, LockedChallenge, RunQueue, VerifiedRun } from '../src/verify/types.ts';
import { AUTO_CHECK_COOLDOWN_MS, useRunVerification, type Verification } from '../src/verify/useRunVerification.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;

const ITEMS = ['6696', '3158', '3146', '3091', '6655', '126697'];
const run = (id: string, lockedAt: number, extra: Partial<LockedChallenge> = {}): LockedChallenge =>
  ({ schema: 2, id, lockedAt, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, ...extra });
const pendingQueue: RunQueue = { runs: [run('c1', 1000)], claimedGameIds: [] };
const game = (gameId: number, gameCreation: number, player: Partial<{ championId: number; spell1Id: number; win: boolean }> = {}) => ({
  gameId, gameCreation, queueId: 2400, mapId: 12, gameMode: 'KIWI',
  player: { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: [6696, 3146, 3158, 3091, 1036, 0, 2052], augments: [1029], ...player },
});
const realGame: LcuRead = { status: 'ok', games: [game(1628325258, 2000)] };
const nothingYet: LcuRead = { status: 'ok', games: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fakeFocus() {
  const listeners = new Set<() => void>();
  return {
    subscribe: vi.fn((listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }),
    fire: () => act(async () => { listeners.forEach(listener => listener()); }),
    size: () => listeners.size,
  };
}

type Hook = ReturnType<typeof useRunVerification>;
async function mountHarness({ queue = pendingQueue, history = [], read, readActive = async () => ({ status: 'ok', active: null }), clock = { now: 1_000_000 } }: {
  queue?: RunQueue; history?: readonly VerifiedRun[]; read: (since: number, gameIds: readonly number[]) => Promise<LcuRead>;
  readActive?: () => Promise<ActiveRead>; clock?: { now: number };
}) {
  const focus = fakeFocus();
  const saves: Verification[] = [];
  let state: Verification = { queue, history };
  const hook: { current?: Hook } = {};
  function Harness() {
    const [current, setCurrent] = useState(state);
    const verification = useRunVerification({
      queue: current.queue, history: current.history, read, readActive, subscribeFocus: focus.subscribe, now: () => clock.now,
      onSave: next => { saves.push(next); state = next; setCurrent(next); },
    });
    hook.current = verification;
    const shown = lockOrder(current.queue.runs).at(-1);
    return shown && <RunCheck run={shown} history={current.history} checking={verification.checking} notice={verification.notices[shown.id] ?? null}
      binding={verification.binding === shown.id} fresh={verification.announcement?.runId === shown.id} onVerify={() => { void verification.verify('manual'); }} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>); });
  return { focus, saves, clock, hook: () => hook.current!, state: () => state };
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const text = () => document.body.textContent ?? '';
const manualButton = () => document.querySelector<HTMLButtonElement>('.run-check .game-button')!;
const status = (state: Verification, id: string) => runStatus(state.queue.runs.find(entry => entry.id === id)!);

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(async () => { await act(async () => { root?.unmount(); }); document.body.innerHTML = ''; });

test('no pending runs: no checks and no focus listener', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => realGame);
  const empty = await mountHarness({ queue: { runs: [], claimedGameIds: [] }, read });
  await empty.focus.fire();
  expect(empty.focus.size()).toBe(0);
  await act(async () => { root.unmount(); });
  const done = { runs: [run('v', 1, { resolution: { kind: 'verified', gameId: 5, gameCreation: 2, resolvedAt: 3 } })], claimedGameIds: [] };
  const resolved = await mountHarness({ queue: done, read });
  await resolved.focus.fire();
  expect(resolved.focus.size()).toBe(0);
  expect(read).not.toHaveBeenCalled();
});

test('startup with pending runs performs one check and stays quiet while League has not published the match', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => nothingYet);
  const harness = await mountHarness({ queue: { runs: [run('c1', 1000), run('b', 500, { activeGameId: 44 })], claimedGameIds: [44] }, read });
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(1000, [44]);
  expect(status(harness.state(), 'c1')).toBe('pending');
  expect(text()).toContain('Waiting for League to publish your Mayhem match…');
  expect(text()).toContain('League may take a few minutes to publish the match.');
  expect(text()).toContain('before or during your ARAM: Mayhem match');
  expect(document.querySelector('.run-check-notice')?.textContent).toBe('');
  expect(harness.focus.size()).toBe(1);
});

test('focus with pending runs performs one check after the cooldown', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => nothingYet);
  const harness = await mountHarness({ read });
  await settle();
  await harness.focus.fire();
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
  await harness.focus.fire();
  await settle();
  expect(read).toHaveBeenCalledTimes(2);
});

test('rapid focus events never start concurrent requests', async () => {
  const gate = deferred<LcuRead>();
  const read = vi.fn(() => gate.promise);
  const harness = await mountHarness({ read });
  expect(text()).toContain('CHECKING');
  for (let i = 0; i < 5; i++) {
    harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
    await harness.focus.fire();
  }
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { gate.resolve(realGame); });
  await settle();
  expect(harness.saves).toHaveLength(1);
});

test('League unavailable or no match yet keeps runs pending without errors', async () => {
  for (const result of [{ status: 'clientNotRunning' }, { status: 'unavailable' }, { status: 'notSignedIn' }, nothingYet] as LcuRead[]) {
    const harness = await mountHarness({ read: async () => result });
    await settle();
    expect(status(harness.state(), 'c1')).toBe('pending');
    expect(harness.saves).toHaveLength(0);
    expect(document.querySelector('.run-check-notice')?.textContent).toBe('');
    expect(manualButton().textContent).toContain('VERIFY RUN');
    await act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
});

test('a published match auto-verifies, is stored once and is announced', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => realGame);
  const harness = await mountHarness({ read });
  await settle();
  expect(harness.saves).toHaveLength(1);
  expect(harness.state().history.map(entry => entry.gameId)).toEqual([1628325258]);
  expect(text()).toContain('JUST RESOLVED!');
  expect(text()).toContain('VICTORY');
  expect(text()).toContain('COMPLETED ITEMS 4/6');
  harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
  await harness.focus.fire();
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  expect(harness.focus.size()).toBe(0);
});

test('a mismatching next match cancels the run without touching stats', async () => {
  const harness = await mountHarness({ read: async () => ({ status: 'ok', games: [game(7, 2000, { championId: 99 }), game(8, 3000)] }) });
  await settle();
  expect(status(harness.state(), 'c1')).toBe('cancelled');
  expect(harness.state().history).toEqual([]);
  expect(text()).toContain('CANCELLED');
  expect(text()).toContain('The next ARAM: Mayhem match did not match this challenge.');
  expect(text()).toContain('✗CHAMPION');
  expect(document.querySelector('.run-check .game-button')).toBeNull();
});

test('manual and automatic checks share one pipeline and cannot double-count', async () => {
  const gate = deferred<LcuRead>();
  const read = vi.fn(() => gate.promise);
  const harness = await mountHarness({ read });
  expect(manualButton().disabled).toBe(true);
  await act(async () => { void harness.hook().verify('manual'); });
  harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
  await harness.focus.fire();
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { gate.resolve(realGame); });
  await settle();
  expect(harness.saves).toHaveLength(1);
  expect(harness.state().history).toHaveLength(1);
});

test('a manual check explains a delayed match in plain words', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => nothingYet);
  await mountHarness({ read });
  await settle();
  await act(async () => { manualButton().click(); });
  await settle();
  expect(read).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.run-check-notice')?.textContent).toBe('League hasn’t published the match yet. This can take a few minutes; it stays pending until then.');
  expect(manualButton().textContent).toContain('CHECK AGAIN');
});

test('locking during an active Mayhem match binds the run to that game', async () => {
  const gate = deferred<ActiveRead>();
  const harness = await mountHarness({ queue: { runs: [], claimedGameIds: [] }, read: async () => nothingYet, readActive: () => gate.promise });
  await act(async () => { void harness.hook().lockRun(run('new', 5000), { bindable: true }); });
  expect(text()).toContain('Looking for a Mayhem match in progress…');
  await act(async () => { gate.resolve({ status: 'ok', active: { gameId: 77, queueId: 2400 } }); });
  await settle();
  expect(harness.state().queue.runs[0]!.activeGameId).toBe(77);
  expect(harness.state().queue.claimedGameIds).toEqual([77]);
  expect(text()).toContain('Linked to the Mayhem match you were playing when you locked in.');
});

test('locking with no match in progress, or no client, waits for the next match', async () => {
  for (const active of [{ status: 'ok', active: null }, { status: 'clientNotRunning' }, { status: 'desktopOnly' }] as ActiveRead[]) {
    const harness = await mountHarness({ queue: { runs: [], claimedGameIds: [] }, read: async () => nothingYet, readActive: async () => active });
    await act(async () => { await harness.hook().lockRun(run('new', 5000), { bindable: true }); });
    expect(harness.state().queue.runs[0]!.activeGameId).toBeUndefined();
    expect(text()).toContain('Counts for your next ARAM: Mayhem match.');
    await act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
});

test('a check finishing while a new run is locked loses neither change', async () => {
  const gate = deferred<LcuRead>();
  const harness = await mountHarness({ read: () => gate.promise }); // Startup check in flight for c1.
  await act(async () => { await harness.hook().lockRun(run('new', 1_500_000), { bindable: false }); });
  await act(async () => { gate.resolve(realGame); });
  await settle();
  const state = harness.state();
  expect(state.queue.runs.map(entry => [entry.id, runStatus(entry)])).toEqual([['c1', 'verified'], ['new', 'pending']]);
  expect(state.history.map(entry => entry.challengeId)).toEqual(['c1']);
});

test('listeners are attached once and cleaned up', async () => {
  const harness = await mountHarness({ read: async () => nothingYet });
  await settle();
  expect(harness.focus.size()).toBe(1);
  await act(async () => { root.unmount(); });
  expect(harness.focus.size()).toBe(0);
});

test('app focus subscription uses window focus and visibility, and unsubscribes', async () => {
  const onFocus = vi.fn();
  const unsubscribe = subscribeAppFocus(onFocus);
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(onFocus).toHaveBeenCalledTimes(document.visibilityState === 'visible' ? 2 : 1);
  unsubscribe();
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  expect(onFocus).toHaveBeenCalledTimes(document.visibilityState === 'visible' ? 2 : 1);
});

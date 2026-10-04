// @vitest-environment happy-dom
import { StrictMode, act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { RunCheck } from '../src/components/RunCheck.tsx';
import { I18nProvider } from '../src/i18n/I18n.tsx';
import { subscribeAppFocus } from '../src/verify/focus.ts';
import type { LcuRead, LockedChallenge, VerifiedRun } from '../src/verify/types.ts';
import { AUTO_CHECK_COOLDOWN_MS, useRunVerification, type Verification } from '../src/verify/useRunVerification.ts';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;

const pending: LockedChallenge = {
  schema: 1, id: 'c1', lockedAt: 1000, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1,
  itemIds: ['6696', '3158', '3146', '3091', '6655', '126697'], status: 'pending',
};
const realGame: LcuRead = { status: 'ok', games: [{
  gameId: 1628325258, gameCreation: 2000, queueId: 2400, mapId: 12, gameMode: 'KIWI',
  player: { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: [6696, 3146, 3158, 3091, 1036, 0, 2052], augments: [1029] },
}] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function fakeFocus() {
  const listeners = new Set<() => void>();
  const unsubscribed = vi.fn();
  return {
    subscribe: vi.fn((listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); unsubscribed(); }; }),
    fire: () => act(async () => { listeners.forEach(listener => listener()); }),
    size: () => listeners.size,
    unsubscribed,
  };
}

async function mountHarness({ challenge = pending, runs = [], read, clock = { now: 1_000_000 } }: {
  challenge?: LockedChallenge | null; runs?: readonly VerifiedRun[]; read: (since: number) => Promise<LcuRead>; clock?: { now: number };
}) {
  const focus = fakeFocus();
  const saves: Verification[] = [];
  let state = { challenge, runs };
  function Harness() {
    const [current, setCurrent] = useState(state);
    const verification = useRunVerification({
      challenge: current.challenge, runs: current.runs, read, subscribeFocus: focus.subscribe, now: () => clock.now,
      onSave: next => { saves.push(next); state = next; setCurrent(next); },
    });
    return current.challenge && <RunCheck challenge={current.challenge} runs={current.runs} checking={verification.checking}
      notice={verification.notice} fresh={verification.announcement !== null} onVerify={() => { void verification.verify('manual'); }} />;
  }
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<StrictMode><I18nProvider><Harness /></I18nProvider></StrictMode>); });
  return { focus, saves, clock, state: () => state };
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const text = () => document.body.textContent ?? '';
const manualButton = () => document.querySelector<HTMLButtonElement>('.run-check .game-button')!;

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(async () => { await act(async () => { root?.unmount(); }); document.body.innerHTML = ''; });

test('no challenge, or a verified one: no checks and no focus listener', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => realGame);
  const none = await mountHarness({ challenge: null, read });
  await none.focus.fire();
  expect(none.focus.size()).toBe(0);
  await act(async () => { root.unmount(); });
  const done = await mountHarness({ challenge: { ...pending, status: 'verified' }, read });
  await done.focus.fire();
  expect(done.focus.size()).toBe(0);
  expect(read).not.toHaveBeenCalled();
});

test('startup with a pending challenge performs one check and stays quiet when nothing is found', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => ({ status: 'ok', games: [] }));
  const harness = await mountHarness({ read });
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(1000);
  expect(harness.state().challenge?.status).toBe('pending');
  expect(text()).toContain('Waiting for your Mayhem match…');
  expect(document.querySelector('.run-check-notice')?.textContent).toBe('');
  expect(harness.focus.size()).toBe(1);
});

test('focus with a pending challenge performs one check after the cooldown', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => ({ status: 'ok', games: [] }));
  const harness = await mountHarness({ read });
  await settle();
  await harness.focus.fire();
  await settle();
  expect(read).toHaveBeenCalledTimes(1); // Still inside the startup check's cooldown.
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
  expect(text()).toContain('Checking your latest Mayhem run…');
  for (let i = 0; i < 5; i++) {
    harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
    await harness.focus.fire();
  }
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { gate.resolve(realGame); });
  await settle();
  expect(harness.saves).toHaveLength(1);
});

test('League unavailable or no match yet keeps the challenge pending without errors', async () => {
  for (const result of [{ status: 'clientNotRunning' }, { status: 'unavailable' }, { status: 'notSignedIn' }, { status: 'ok', games: [] }] as LcuRead[]) {
    const harness = await mountHarness({ read: async () => result });
    await settle();
    expect(harness.state().challenge?.status).toBe('pending');
    expect(harness.saves).toHaveLength(0);
    expect(document.querySelector('.run-check-notice')?.textContent).toBe('');
    expect(manualButton().textContent).toContain('VERIFY RUN');
    await act(async () => { root.unmount(); });
    document.body.innerHTML = '';
  }
});

test('a valid match auto-verifies, is stored once and is announced', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => realGame);
  const harness = await mountHarness({ read });
  await settle();
  expect(harness.saves).toHaveLength(1);
  expect(harness.state().runs.map(run => run.gameId)).toEqual([1628325258]);
  expect(text()).toContain('JUST VERIFIED!');
  expect(text()).toContain('VICTORY');
  expect(text()).toContain('COMPLETED ITEMS 4/6');
  // Verified is final: later focus events do nothing.
  harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
  await harness.focus.fire();
  await settle();
  expect(read).toHaveBeenCalledTimes(1);
  expect(harness.focus.size()).toBe(0);
});

test('manual and automatic checks share one pipeline and cannot double-count', async () => {
  const gate = deferred<LcuRead>();
  const read = vi.fn(() => gate.promise);
  const harness = await mountHarness({ read });
  expect(manualButton().disabled).toBe(true);
  await act(async () => { manualButton().click(); }); // Ignored while the automatic check runs.
  harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
  await harness.focus.fire();
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { gate.resolve(realGame); });
  await settle();
  expect(harness.saves).toHaveLength(1);
  expect(harness.state().runs).toHaveLength(1);
});

test('a manual check reports what it found; the same game is never counted for another challenge', async () => {
  const counted = { ...(await (async () => {
    const harness = await mountHarness({ read: async () => realGame });
    await settle();
    await act(async () => { root.unmount(); });
    return harness.state().runs[0]!;
  })()), challengeId: 'old' };
  document.body.innerHTML = '';
  const read = vi.fn(async (): Promise<LcuRead> => realGame);
  const harness = await mountHarness({ challenge: { ...pending, id: 'c2' }, runs: [counted], read });
  await settle();
  expect(harness.saves).toHaveLength(0);
  await act(async () => { manualButton().click(); });
  await settle();
  expect(read).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.run-check-notice')?.textContent).toBe('That ARAM: Mayhem game was already counted for another run.');
  expect(harness.state().runs).toHaveLength(1);
});

test('an unverifiable result is kept, not counted, and can be checked again manually', async () => {
  const read = vi.fn(async (): Promise<LcuRead> => ({ status: 'ok', games: [{
    gameId: 5, gameCreation: 2000, queueId: 2400, mapId: 12, gameMode: 'KIWI',
    player: { championId: 236, spell1Id: 4, spell2Id: 1, win: true, items: [6696, 0, 0, 0, 0, 0, 2052], augments: [] },
  }] }));
  const harness = await mountHarness({ read });
  await settle();
  expect(harness.state().challenge?.status).toBe('unverifiable');
  expect(harness.state().runs).toHaveLength(0);
  expect(text()).toContain('Could not safely verify this run.');
  harness.clock.now += AUTO_CHECK_COOLDOWN_MS;
  await harness.focus.fire();
  expect(read).toHaveBeenCalledTimes(1); // Automatic checks are for pending challenges only.
  await act(async () => { manualButton().click(); });
  await settle();
  expect(read).toHaveBeenCalledTimes(2);
});

test('listeners are attached once and cleaned up', async () => {
  const harness = await mountHarness({ read: async () => ({ status: 'ok', games: [] }) });
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

// @vitest-environment happy-dom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { I18nProvider } from '../src/i18n/I18n.tsx';
import { gameData, rules } from '../src/data/index.ts';
import { createDraft, finalizeBuild, generateBuild, rerollSlot } from '../src/engine/draft.ts';
import { serializeSession, sessionStorageKey } from '../src/session.ts';
import { historyStorageKey, legacyChallengeStorageKey, parseHistory, parseQueue, queueStorageKey, serializeHistory, serializeQueue } from '../src/verify/challenge.ts';
import { runStatus } from '../src/verify/queue.ts';
import type { ActiveRead, LcuRead, LockedChallenge, RunQueue, VerifiedRun } from '../src/verify/types.ts';
import { AUTO_CHECK_COOLDOWN_MS } from '../src/verify/useRunVerification.ts';

// The League Client boundary is mocked; nothing here needs League installed.
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
const context = { data: gameData, rules, random: () => 0 };
const ITEMS = ['6696', '3158', '3146', '3091', '6655', '126697'];
let root: Root | undefined;

async function mountApp() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => { root!.render(<StrictMode><I18nProvider><App /></I18nProvider></StrictMode>); });
}
async function restart() {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = '';
  await mountApp();
}
const settle = (ms = 0) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
function button(label: string) {
  const match = [...document.querySelectorAll('button')].find(element => element.textContent?.trim().includes(label));
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
const click = (label: string) => act(async () => { button(label).click(); });
const text = () => document.body.textContent ?? '';
const history = () => parseHistory(localStorage.getItem(historyStorageKey));
const queue = () => parseQueue(localStorage.getItem(queueStorageKey));
const run = (id: string, lockedAt: number, extra: Partial<LockedChallenge> = {}): LockedChallenge =>
  ({ schema: 2, id, lockedAt, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, ...extra });
const seedQueue = (value: RunQueue) => localStorage.setItem(queueStorageKey, serializeQueue(value));
const game = (gameId: number, gameCreation: number, championId = 236, win = true) => ({
  gameId, gameCreation, queueId: 2400, mapId: 12, gameMode: 'KIWI',
  player: { championId, spell1Id: 32, spell2Id: 1, win, items: [6696, 3146, 3158, 3091, 1036, 0, 2052], augments: [1029] },
});
const realGame: LcuRead = { status: 'ok', games: [game(1628325258, 2000)] };
function verified(gameId: number, gameCreation: number, win: boolean, championId = 'Lucian', completed = 4): VerifiedRun {
  return {
    challengeId: `c${gameId}`, lockedAt: gameCreation - 1, gameId, gameCreation, verifiedAt: gameCreation + 1,
    championId, championKey: 236, lockedSpellIds: [32, 1], actualSpellIds: [32, 1], challengeItemIds: ITEMS,
    finalItemIds: [6696, 3158, 3146, 3091, 0, 0], completedItemIds: ITEMS.slice(0, completed), win,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  lcu.read.mockReset();
  lcu.read.mockResolvedValue({ status: 'desktopOnly' });
  lcu.active.mockReset();
  lcu.active.mockResolvedValue({ status: 'desktopOnly' });
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

test('LOCK IT IN queues a pending run; startup checks it once; history is untouched', async () => {
  localStorage.setItem(historyStorageKey, serializeHistory([verified(1, 100, true)]));
  let draft = generateBuild(createDraft(gameData.champions.find(champion => champion.id === 'Lucian')!, context), context);
  for (const slot of [0, 2, 3]) draft = rerollSlot(draft, slot, draft.revision, context);
  localStorage.setItem(sessionStorageKey, serializeSession({ page: 'draft', draft }));
  await mountApp();
  await settle(20); // The finalizing build locks itself in.

  expect(document.querySelector('.final-page')).not.toBeNull();
  const [locked] = queue().runs;
  expect(locked).toMatchObject({ schema: 2, championId: 'Lucian', championKey: 236 });
  expect(runStatus(locked!)).toBe('pending');
  expect(lcu.active).toHaveBeenCalledTimes(1); // One look for a match in progress.
  expect(lcu.read).not.toHaveBeenCalled(); // No published game can exist yet.
  expect(text()).toContain('Counts for your next ARAM: Mayhem match.');
  expect(history()).toHaveLength(1);

  lcu.read.mockResolvedValue({ status: 'clientNotRunning' });
  await click('VERIFY RUN');
  await settle();
  expect(lcu.read).toHaveBeenCalledWith(locked!.lockedAt, []);
  expect(document.querySelector('.run-check-notice')?.textContent).toBe('League isn’t open. Start the League client and try again.');

  localStorage.removeItem(sessionStorageKey);
  lcu.read.mockClear();
  await restart();
  await settle();
  expect(lcu.read).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.welcome .run-check-notice')?.textContent).toBe('');
  expect(text()).toContain('YOUR LATEST CHALLENGE');
  expect(history()).toHaveLength(1);
});

test('startup auto-verifies a published match exactly once, across restarts', async () => {
  seedQueue({ runs: [run('c1', 1000)], claimedGameIds: [] });
  lcu.read.mockResolvedValue(realGame);
  await mountApp();
  await settle();
  expect(text()).toContain('JUST RESOLVED!');
  expect(text()).toContain('VICTORY');
  expect(history().map(entry => entry.gameId)).toEqual([1628325258]);
  expect(runStatus(queue().runs[0]!)).toBe('verified');
  await restart();
  await settle();
  expect(lcu.read).toHaveBeenCalledTimes(1);
  expect(history()).toHaveLength(1);
});

test('a pending v0.1.4 challenge is migrated into the queue on first start', async () => {
  localStorage.setItem(legacyChallengeStorageKey, JSON.stringify({
    schema: 1, id: 'legacy', lockedAt: 1000, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, status: 'pending',
  }));
  lcu.read.mockResolvedValue({ status: 'ok', games: [] });
  await mountApp();
  await settle();
  expect(localStorage.getItem(legacyChallengeStorageKey)).toBeNull();
  expect(queue().runs.map(entry => [entry.id, runStatus(entry)])).toEqual([['legacy', 'pending']]);
  expect(lcu.read).toHaveBeenCalledWith(1000, []);
});

test('a run resolved on focus while elsewhere in the app shows a banner', async () => {
  let clock = 1_000_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  seedQueue({ runs: [run('c1', 1000)], claimedGameIds: [] });
  lcu.read.mockResolvedValue({ status: 'ok', games: [] });
  await mountApp();
  await settle();
  await click('LET’S GAMBLE!');
  lcu.read.mockResolvedValue({ status: 'ok', games: [game(9, 2000, 99)] });
  clock += AUTO_CHECK_COOLDOWN_MS;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await settle();
  expect(document.querySelector('.verify-banner')?.textContent).toContain('Your last run was cancelled');
  await click('SEE HISTORY');
  expect(document.querySelector('.history-card.cancelled')).not.toBeNull();
});

test('history shows waiting runs first, then verified and cancelled runs; stats count verified runs only', async () => {
  localStorage.setItem(historyStorageKey, serializeHistory([verified(3, 3_000_000, true, 'Lucian', 4), verified(1, 1_000_000, false, 'Jinx', 6), verified(2, 2_000_000, true, 'Braum', 3)]));
  seedQueue({ runs: [
    run('wait', 5_000_000, { championId: 'Olaf' }),
    run('gone', 3_500_000, { championId: 'Darius', resolution: { kind: 'cancelled', gameId: 40, gameCreation: 4_000_000, resolvedAt: 4_100_000, reason: 'CHAMPION_MISMATCH', championMatch: false, spellsMatch: true } }),
  ], claimedGameIds: [] });
  lcu.read.mockResolvedValue({ status: 'ok', games: [] });
  await mountApp();
  await settle();
  const reads = lcu.read.mock.calls.length;
  await click('RUN HISTORY');
  expect(lcu.read.mock.calls.length).toBe(reads); // Rendering history never contacts League.
  const cards = [...document.querySelectorAll('.history-card')];
  expect(cards.map(card => card.querySelector('strong')?.textContent)).toEqual(['Olaf', 'Darius', 'Lucian', 'Braum', 'Jinx']);
  expect(cards[0]!.textContent).toContain('PENDING');
  expect(cards[0]!.textContent).toContain('League may take a few minutes');
  expect(cards[1]!.textContent).toContain('CANCELLED');
  expect(cards[1]!.textContent).toContain('The next ARAM: Mayhem match did not match this challenge.');
  expect(cards[2]!.textContent).toContain('VICTORY');
  expect(cards[2]!.textContent).toContain('COMPLETED ITEMS 4/6');
  expect(cards[2]!.querySelectorAll('.history-build li.done')).toHaveLength(4);
  const stats = document.querySelector('.history-stats')!.textContent!;
  for (const label of ['VERIFIED RUNS3', 'WINS2', 'LOSSES1', 'WIN RATE67%', 'RIGHT NOW2', 'PERSONAL BEST2']) expect(stats).toContain(label);
  expect(text()).toContain('order isn’t verified');
  await click('BACK HOME');
  expect(document.querySelector('.welcome')).not.toBeNull();
});

test('empty history shows placeholders', async () => {
  await mountApp();
  await click('RUN HISTORY');
  expect(text()).toContain('No runs yet.');
  expect(document.querySelector('.history-stats')!.textContent).toContain('WIN RATE—');
});

test('returning home and starting a new challenge never clear history or the queue', async () => {
  localStorage.setItem(historyStorageKey, serializeHistory([verified(1, 100, true)]));
  seedQueue({ runs: [run('wait', 1000)], claimedGameIds: [] });
  const draft = finalizeBuild(generateBuild(createDraft(gameData.champions[0]!, context), context));
  localStorage.setItem(sessionStorageKey, serializeSession({ page: 'result', draft }));
  await mountApp();
  await click('RETURN TO HOME');
  await act(async () => { document.querySelector<HTMLButtonElement>('dialog .game-button.danger')!.click(); });
  expect(localStorage.getItem(sessionStorageKey)).toBeNull();
  await click('LET’S GAMBLE!');
  expect(history()).toHaveLength(1);
  expect(queue().runs.map(entry => entry.id)).toEqual(['wait']);
});

test('malformed stored history and queue are ignored safely', async () => {
  localStorage.setItem(historyStorageKey, '{"schema":1,"runs":[{"gameId":"nope"}]}');
  localStorage.setItem(queueStorageKey, '{broken');
  await mountApp();
  expect(document.querySelector('.welcome')).not.toBeNull();
  expect(document.querySelector('.run-check')).toBeNull();
  await click('RUN HISTORY');
  expect(text()).toContain('No runs yet.');
});

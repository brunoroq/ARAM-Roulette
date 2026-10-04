// @vitest-environment happy-dom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../src/App.tsx';
import { I18nProvider } from '../src/i18n/I18n.tsx';
import { gameData, rules } from '../src/data/index.ts';
import { createDraft, finalizeBuild, generateBuild, rerollSlot } from '../src/engine/draft.ts';
import { serializeSession, sessionStorageKey } from '../src/session.ts';
import { challengeStorageKey, historyStorageKey, parseChallenge, parseHistory, serializeHistory } from '../src/verify/challenge.ts';
import type { LcuRead, LockedChallenge, VerifiedRun } from '../src/verify/types.ts';
import { AUTO_CHECK_COOLDOWN_MS } from '../src/verify/useRunVerification.ts';

// The League Client boundary is mocked; nothing here needs League installed.
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

const pending: LockedChallenge = {
  schema: 1, id: 'c1', lockedAt: 1000, championId: 'Lucian', championKey: 236, spellD: 32, spellF: 1, itemIds: ITEMS, status: 'pending',
};
const realGame: LcuRead = { status: 'ok', games: [{
  gameId: 1628325258, gameCreation: 2000, queueId: 2400, mapId: 12, gameMode: 'KIWI',
  player: { championId: 236, spell1Id: 32, spell2Id: 1, win: true, items: [6696, 3146, 3158, 3091, 1036, 0, 2052], augments: [1029] },
}] };
function run(gameId: number, gameCreation: number, win: boolean, championId = 'Lucian', completed = 4): VerifiedRun {
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
});
afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

test('LOCK IT IN stores a pending challenge; startup checks it once and history is untouched', async () => {
  localStorage.setItem(historyStorageKey, serializeHistory([run(1, 100, true)]));
  let draft = generateBuild(createDraft(gameData.champions.find(champion => champion.id === 'Lucian')!, context), context);
  for (const slot of [0, 2, 3]) draft = rerollSlot(draft, slot, draft.revision, context);
  localStorage.setItem(sessionStorageKey, serializeSession({ page: 'draft', draft }));
  await mountApp();
  await settle(20); // The finalizing build locks itself in.

  expect(document.querySelector('.final-page')).not.toBeNull();
  const challenge = parseChallenge(localStorage.getItem(challengeStorageKey));
  expect(challenge).toMatchObject({ status: 'pending', championId: 'Lucian', championKey: 236 });
  expect(lcu.read).not.toHaveBeenCalled(); // No game can exist yet.
  expect(text()).toContain('Waiting for your Mayhem match…');
  expect(history()).toHaveLength(1);

  lcu.read.mockResolvedValue({ status: 'clientNotRunning' });
  await click('VERIFY RUN');
  await settle();
  expect(lcu.read).toHaveBeenCalledWith(challenge!.lockedAt);
  expect(document.querySelector('.run-check-notice')?.textContent).toBe('League isn’t open. Start the League client and try again.');

  localStorage.removeItem(sessionStorageKey);
  lcu.read.mockClear();
  await restart();
  await settle();
  expect(lcu.read).toHaveBeenCalledTimes(1); // Startup check, quiet on failure.
  expect(document.querySelector('.welcome .run-check-notice')?.textContent).toBe('');
  expect(text()).toContain('YOUR LOCKED CHALLENGE');
  expect(history()).toHaveLength(1);
});

test('startup auto-verifies a finished game exactly once, across restarts', async () => {
  localStorage.setItem(challengeStorageKey, JSON.stringify(pending));
  lcu.read.mockResolvedValue(realGame);
  await mountApp();
  await settle();
  expect(text()).toContain('JUST VERIFIED!');
  expect(text()).toContain('VICTORY');
  expect(history().map(entry => entry.gameId)).toEqual([1628325258]);
  expect(parseChallenge(localStorage.getItem(challengeStorageKey))?.status).toBe('verified');

  await restart();
  await settle();
  expect(lcu.read).toHaveBeenCalledTimes(1);
  expect(history()).toHaveLength(1);
  expect(text()).not.toContain('JUST VERIFIED!');
});

test('a run verified on focus while elsewhere in the app shows a banner', async () => {
  let clock = 1_000_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  localStorage.setItem(challengeStorageKey, JSON.stringify(pending));
  lcu.read.mockResolvedValue({ status: 'ok', games: [] });
  await mountApp();
  await settle();
  await click('LET’S GAMBLE!');
  lcu.read.mockResolvedValue(realGame);
  clock += AUTO_CHECK_COOLDOWN_MS;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await settle();
  expect(lcu.read).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.verify-banner')?.textContent).toContain('Your last run is verified: VICTORY.');
  await click('SEE HISTORY');
  expect(document.querySelector('.history-page')).not.toBeNull();
  expect(document.querySelectorAll('.history-card')).toHaveLength(1);
});

test('history lists verified runs newest first with stats, without contacting League', async () => {
  // Stored out of order: played L (Jinx), W (Braum), W (Lucian).
  localStorage.setItem(historyStorageKey, serializeHistory([run(3, 3_000_000, true, 'Lucian', 4), run(1, 1_000_000, false, 'Jinx', 6), run(2, 2_000_000, true, 'Braum', 3)]));
  await mountApp();
  await click('RUN HISTORY');
  expect(lcu.read).not.toHaveBeenCalled();
  const cards = [...document.querySelectorAll('.history-card')];
  expect(cards.map(card => card.querySelector('strong')?.textContent)).toEqual(['Lucian', 'Braum', 'Jinx']);
  expect(cards[0]!.textContent).toContain('VICTORY');
  expect(cards[0]!.textContent).toContain('VERIFIED');
  expect(cards[0]!.textContent).toContain('COMPLETED ITEMS 4/6');
  expect(cards[2]!.textContent).toContain('DEFEAT');
  expect(cards[0]!.querySelectorAll('.history-build li')).toHaveLength(6);
  expect(cards[0]!.querySelectorAll('.history-build li.done')).toHaveLength(4);
  expect(cards[0]!.querySelector('time')?.getAttribute('dateTime')).toBe(new Date(3_000_000).toISOString());
  const stats = document.querySelector('.history-stats')!.textContent!;
  for (const label of ['VERIFIED RUNS3', 'WINS2', 'LOSSES1', 'WIN RATE67%', 'RANDOM WIN STREAK', 'RIGHT NOW2', 'PERSONAL BEST2']) expect(stats).toContain(label);
  expect(text()).toContain('order isn’t verified');
  expect(text()).not.toMatch(/purchased first|bought first/i);
  await click('BACK HOME');
  expect(document.querySelector('.welcome')).not.toBeNull();
});

test('empty history shows placeholders', async () => {
  await mountApp();
  await click('RUN HISTORY');
  expect(text()).toContain('No verified runs yet.');
  expect(document.querySelector('.history-stats')!.textContent).toContain('WIN RATE—');
  expect(document.querySelector('.history-stats')!.textContent).toContain('RIGHT NOW0');
});

test('returning home and starting a new challenge never clear history', async () => {
  localStorage.setItem(historyStorageKey, serializeHistory([run(1, 100, true)]));
  const draft = finalizeBuild(generateBuild(createDraft(gameData.champions[0]!, context), context));
  localStorage.setItem(sessionStorageKey, serializeSession({ page: 'result', draft }));
  await mountApp();
  await click('RETURN TO HOME');
  await act(async () => { document.querySelector<HTMLButtonElement>('dialog .game-button.danger')!.click(); });
  expect(localStorage.getItem(sessionStorageKey)).toBeNull();
  expect(history()).toHaveLength(1);
  await click('LET’S GAMBLE!');
  expect(history()).toHaveLength(1);
});

test('malformed stored history and challenge are ignored safely', async () => {
  localStorage.setItem(historyStorageKey, '{"schema":1,"runs":[{"gameId":"nope"}]}');
  localStorage.setItem(challengeStorageKey, '{broken');
  await mountApp();
  expect(document.querySelector('.welcome')).not.toBeNull();
  expect(document.querySelector('.run-check')).toBeNull();
  await click('RUN HISTORY');
  expect(text()).toContain('No verified runs yet.');
});

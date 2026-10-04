import { useCallback, useEffect, useRef, useState } from 'react';
import { verificationData } from '../data/index.ts';
import { subscribeAppFocus } from './focus.ts';
import { readActiveGame, readRecentMayhemGames } from './lcu.ts';
import { addRun, bindRun, isPending, readRequest, resolveQueue } from './queue.ts';
import type { ActiveRead, LcuRead, LockedChallenge, PendingReason, Resolution, RunQueue, VerifiedRun } from './types.ts';

/** Minimum gap between automatic checks; focus events arrive in bursts. */
export const AUTO_CHECK_COOLDOWN_MS = 15_000;

export type CheckSource = 'manual' | 'auto';
export interface Verification { queue: RunQueue; history: readonly VerifiedRun[] }

/**
 * The one verification pipeline for the whole run queue, shared by VERIFY RUN / CHECK AGAIN and
 * the automatic checks on startup and when the player returns to the app. At most one check
 * runs at a time; every change is applied to the latest stored state (updated synchronously,
 * before React re-renders), so nothing is lost or counted twice. Automatic checks run only
 * while some run is pending and never poll.
 */
export function useRunVerification({
  queue, history, onSave, read = readRecentMayhemGames, readActive = readActiveGame, subscribeFocus = subscribeAppFocus, now = Date.now,
}: {
  queue: RunQueue;
  history: readonly VerifiedRun[];
  onSave: (next: Verification) => void;
  read?: (since: number, gameIds: readonly number[]) => Promise<LcuRead>;
  readActive?: () => Promise<ActiveRead>;
  subscribeFocus?: (onFocus: () => void) => () => void;
  now?: () => number;
}) {
  const [checking, setChecking] = useState(false);
  /** Why runs are still pending, after a manual check. Automatic checks stay quiet. */
  const [notices, setNotices] = useState<Readonly<Record<string, PendingReason>>>({});
  /** A result reached by an automatic check, announced until dismissed or replaced. */
  const [announcement, setAnnouncement] = useState<{ runId: string; kind: Resolution['kind'] } | null>(null);
  /** A just-locked run whose active-game check is running. */
  const [binding, setBinding] = useState<string | null>(null);
  const latest = useRef({ queue, history, onSave, read, readActive, now });
  latest.current = { queue, history, onSave, read, readActive, now };
  const inFlight = useRef<Promise<void> | null>(null);
  const lastAuto = useRef(Number.NEGATIVE_INFINITY);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const commit = useCallback((next: Verification) => {
    latest.current = { ...latest.current, queue: next.queue, history: next.history };
    latest.current.onSave(next);
  }, []);

  const verify = useCallback((source: CheckSource): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const request = readRequest(latest.current.queue);
    if (!request) return Promise.resolve();
    if (source === 'auto') {
      const time = latest.current.now();
      if (time - lastAuto.current < AUTO_CHECK_COOLDOWN_MS) return Promise.resolve();
      lastAuto.current = time;
    }
    setChecking(true);
    if (source === 'manual') setNotices({});
    const run = async () => {
      let waiting: Readonly<Record<string, PendingReason>> = {};
      try {
        const result = await latest.current.read(request.since, request.gameIds);
        const { queue: current, history: currentHistory, now: clock } = latest.current;
        const outcome = resolveQueue(current, currentHistory, result, verificationData, clock());
        waiting = outcome.waiting;
        if (outcome.resolved.length) {
          commit({ queue: outcome.queue, history: outcome.history });
          const newest = outcome.resolved.at(-1)!;
          if (source === 'auto' && mounted.current) setAnnouncement({ runId: newest.id, kind: newest.resolution!.kind });
        }
      } catch {
        waiting = Object.fromEntries(latest.current.queue.runs.filter(isPending).map(entry => [entry.id, 'LCU_UNAVAILABLE' as const]));
      } finally {
        inFlight.current = null;
        if (mounted.current) {
          setChecking(false);
          if (source === 'manual') setNotices(waiting);
        }
      }
    };
    inFlight.current = run();
    return inFlight.current;
  }, [commit]);

  /**
   * LOCK IT IN: store the run (optionally replacing the run waiting for the next game), then ask
   * the client once whether a match is in progress and bind the run to it if the rules allow.
   * `lockedAt` is taken before that request, so a bound game had not ended when the run was locked.
   */
  const lockRun = useCallback((run: LockedChallenge, options: { replaceId?: string; bindable: boolean }): Promise<void> => {
    commit({ queue: addRun(latest.current.queue, run, options.replaceId), history: latest.current.history });
    setBinding(run.id);
    return (async () => {
      let active: ActiveRead = { status: 'unavailable' };
      try { active = await latest.current.readActive(); } catch { /* Unbound: next eligible game. */ }
      const { queue: current, history: currentHistory } = latest.current;
      const next = bindRun(current, currentHistory, run.id, active, options.bindable);
      if (next !== current) commit({ queue: next, history: currentHistory });
      if (mounted.current) setBinding(value => (value === run.id ? null : value));
    })();
  }, [commit]);

  // Startup / restore with pending runs. (A run locked just now has no published game yet.)
  useEffect(() => { void verify('auto'); }, [verify]);
  const hasPending = queue.runs.some(isPending);
  useEffect(() => {
    if (!hasPending) return;
    return subscribeFocus(() => { void verify('auto'); });
  }, [hasPending, subscribeFocus, verify]);

  return {
    /** Latest known queue, including saves not yet rendered. */
    currentQueue: useCallback(() => latest.current.queue, []),
    checking,
    notices,
    announcement,
    binding,
    dismissAnnouncement: useCallback(() => setAnnouncement(null), []),
    verify,
    lockRun,
  };
}

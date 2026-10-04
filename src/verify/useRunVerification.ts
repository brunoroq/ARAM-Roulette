import { useCallback, useEffect, useRef, useState } from 'react';
import { verificationData } from '../data/index.ts';
import { applyOutcome } from './challenge.ts';
import { subscribeAppFocus } from './focus.ts';
import { readRecentMayhemGames } from './lcu.ts';
import type { LcuRead, LockedChallenge, Outcome, PendingReason, VerifiedRun } from './types.ts';
import { verifyChallenge } from './verifier.ts';

/** Minimum gap between automatic checks; focus events arrive in bursts. */
export const AUTO_CHECK_COOLDOWN_MS = 15_000;

export type CheckSource = 'manual' | 'auto';
export interface Verification { challenge: LockedChallenge; runs: readonly VerifiedRun[] }

/**
 * The one verification pipeline, shared by VERIFY RUN and the automatic checks on startup
 * and when the player returns to the app. At most one check runs at a time; its outcome is
 * applied to the latest stored state, only if the same challenge is still locked.
 * Automatic checks run only for a pending challenge and never poll.
 */
export function useRunVerification({ challenge, runs, onSave, read = readRecentMayhemGames, subscribeFocus = subscribeAppFocus, now = Date.now }: {
  challenge: LockedChallenge | null;
  runs: readonly VerifiedRun[];
  onSave: (next: Verification) => void;
  read?: (since: number) => Promise<LcuRead>;
  subscribeFocus?: (onFocus: () => void) => () => void;
  now?: () => number;
}) {
  const [checking, setChecking] = useState(false);
  /** Shown after a manual check that found nothing conclusive. Automatic checks stay quiet. */
  const [notice, setNotice] = useState<{ challengeId: string; reason: PendingReason } | null>(null);
  /** A result reached by an automatic check, announced until dismissed or replaced. */
  const [announcement, setAnnouncement] = useState<{ challengeId: string; kind: Exclude<Outcome['kind'], 'pending'> } | null>(null);
  const latest = useRef({ challenge, runs, onSave, read, now });
  latest.current = { challenge, runs, onSave, read, now };
  const inFlight = useRef<Promise<void> | null>(null);
  const lastAuto = useRef(Number.NEGATIVE_INFINITY);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const verify = useCallback((source: CheckSource): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const target = latest.current.challenge;
    if (!target || target.status === 'verified') return Promise.resolve();
    if (source === 'auto') {
      const time = latest.current.now();
      if (target.status !== 'pending' || time - lastAuto.current < AUTO_CHECK_COOLDOWN_MS) return Promise.resolve();
      lastAuto.current = time;
    }
    setChecking(true);
    if (source === 'manual') setNotice(null);
    const run = async () => {
      let reason: PendingReason | null = null;
      try {
        const result = await latest.current.read(target.lockedAt);
        const { challenge: current, runs: currentRuns, onSave: save, now: clock } = latest.current;
        if (!current || current.id !== target.id) return; // A newer LOCK IT IN replaced it.
        const outcome = verifyChallenge(current, result, new Set(currentRuns.map(entry => entry.gameId)), verificationData, clock());
        if (outcome.kind === 'pending') { reason = outcome.reason; return; }
        const next = applyOutcome(current, currentRuns, outcome);
        // Visible to any check that starts before React re-renders, so a game is never counted twice.
        latest.current = { ...latest.current, challenge: next.challenge, runs: next.runs };
        save(next);
        if (source === 'auto' && mounted.current) setAnnouncement({ challengeId: current.id, kind: outcome.kind });
      } catch {
        reason = 'LCU_UNAVAILABLE';
      } finally {
        inFlight.current = null;
        if (mounted.current) {
          setChecking(false);
          if (source === 'manual' && reason) setNotice({ challengeId: target.id, reason });
        }
      }
    };
    inFlight.current = run();
    return inFlight.current;
  }, []);

  // Startup / restore with a pending challenge. (A challenge locked just now has no game yet.)
  useEffect(() => { void verify('auto'); }, [verify]);
  const pending = challenge?.status === 'pending';
  useEffect(() => {
    if (!pending) return;
    return subscribeFocus(() => { void verify('auto'); });
  }, [pending, subscribeFocus, verify]);

  const challengeId = challenge?.id ?? null;
  return {
    /** Latest known challenge, including saves not yet rendered. */
    currentChallenge: useCallback(() => latest.current.challenge, []),
    /** Record a challenge saved outside this hook (LOCK IT IN) before React re-renders. */
    syncChallenge: useCallback((next: LockedChallenge) => { latest.current = { ...latest.current, challenge: next }; }, []),
    checking,
    notice: notice?.challengeId === challengeId ? notice.reason : null,
    announcement: announcement?.challengeId === challengeId ? announcement.kind : null,
    dismissAnnouncement: useCallback(() => setAnnouncement(null), []),
    verify,
  };
}

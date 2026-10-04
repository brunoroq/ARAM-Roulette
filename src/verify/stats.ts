import type { VerifiedRun } from './types.ts';

// Personal statistics, derived on demand from verified runs only. Unverifiable attempts and
// Mayhem games played without a locked challenge are never stored, so they cannot count,
// break or extend anything.

export interface RunStats {
  readonly runs: number;
  readonly wins: number;
  readonly losses: number;
  /** wins / runs, or null with no runs. */
  readonly winRate: number | null;
  /** Consecutive verified wins ending with the most recent verified run. */
  readonly currentStreak: number;
  readonly bestStreak: number;
}

/** Oldest first by game creation; ties by game ID so the order never depends on insertion. */
export function chronological(runs: readonly VerifiedRun[]): VerifiedRun[] {
  return [...runs].sort((a, b) => a.gameCreation - b.gameCreation || a.gameId - b.gameId);
}

export function runStats(runs: readonly VerifiedRun[]): RunStats {
  let wins = 0;
  let streak = 0;
  let bestStreak = 0;
  for (const run of chronological(runs)) {
    if (run.win) {
      wins++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      streak = 0;
    }
  }
  return { runs: runs.length, wins, losses: runs.length - wins, winRate: runs.length ? wins / runs.length : null, currentStreak: streak, bestStreak };
}

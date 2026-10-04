import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ActiveRead, LcuRead } from './types.ts';
import { parseActiveRead, parseLcuRead } from './verifier.ts';

// The League Client connection, its credentials and other players' data stay in Rust.

/** The signed-in player's own recent games created after `since`, plus the bound games by ID. */
export async function readRecentMayhemGames(since: number, gameIds: readonly number[] = []): Promise<LcuRead> {
  if (!isTauri()) return { status: 'desktopOnly' };
  try {
    return parseLcuRead(await invoke('read_recent_mayhem_games', { since, gameIds: [...gameIds] }));
  } catch {
    return { status: 'unavailable' };
  }
}

/** The match the client reports in progress right now, if any (game ID and queue only). */
export async function readActiveGame(): Promise<ActiveRead> {
  if (!isTauri()) return { status: 'desktopOnly' };
  try {
    return parseActiveRead(await invoke('read_active_game'));
  } catch {
    return { status: 'unavailable' };
  }
}

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { LcuRead } from './types.ts';
import { parseLcuRead } from './verifier.ts';

/**
 * Asks the native side for the signed-in player's own recent games created after `since`.
 * The League Client connection, its credentials and other players' data stay in Rust.
 */
export async function readRecentMayhemGames(since: number): Promise<LcuRead> {
  if (!isTauri()) return { status: 'desktopOnly' };
  try {
    return parseLcuRead(await invoke('read_recent_mayhem_games', { since }));
  } catch {
    return { status: 'unavailable' };
  }
}

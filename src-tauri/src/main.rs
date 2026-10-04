#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lcu;

/// Native commands for challenge checks. They return sanitized own-player data only;
/// League Client credentials stay in Rust.
#[tauri::command]
async fn read_recent_mayhem_games(since: i64, game_ids: Vec<i64>) -> lcu::RecentGames {
    let bound: Vec<i64> = game_ids.into_iter().filter(|id| *id > 0).take(lcu::MAX_BOUND_GAMES).collect();
    tauri::async_runtime::spawn_blocking(move || lcu::read_recent_games(since, &bound))
        .await
        .unwrap_or(lcu::RecentGames::Unavailable)
}

#[tauri::command]
async fn read_active_game() -> lcu::ActiveRead {
    tauri::async_runtime::spawn_blocking(lcu::read_active_game).await.unwrap_or(lcu::ActiveRead::Unavailable)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_recent_mayhem_games, read_active_game])
        .run(tauri::generate_context!())
        .expect("Unable to start ARAM Roulette");
}

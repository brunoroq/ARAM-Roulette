#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod lcu;

/// The only native command for challenge checks. Returns sanitized own-player records;
/// League Client credentials stay in Rust.
#[tauri::command]
async fn read_recent_mayhem_games(since: i64) -> lcu::RecentGames {
    tauri::async_runtime::spawn_blocking(move || lcu::read_recent_games(since))
        .await
        .unwrap_or(lcu::RecentGames::Unavailable)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![read_recent_mayhem_games])
        .run(tauri::generate_context!())
        .expect("Unable to start ARAM Roulette");
}

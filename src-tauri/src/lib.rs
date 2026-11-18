// The thin Tauri shell. All Board logic lives in the TypeScript UI; the shell only
// grants it read access to the scan roots through the fs plugin, and lets it run the
// few read-only `gh` commands the GitHub port needs through the shell plugin, and
// opens a Ticket in VS Code or on GitHub through the opener plugin (see capabilities/).
// It also owns the menu-bar extra's tray icon and popover window (menu_bar.rs), and the
// Settings window, the Settings file and the scan roots added in Settings (settings.rs,
// scan_roots.rs), with "Settings…" in the app menu.
mod menu_bar;
mod scan_roots;
mod settings;

use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_dialog::init())
        // Open at login, off until turned on in Settings or the popover: a Launch Agent in
        // ~/Library/LaunchAgents, which needs no Automation permission (AppleScript would).
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        // Remembers the Board window's size and position, not whether it was showing: closing it
        // only hides it, so it would otherwise start hidden after being closed and quit.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                .with_denylist(&[menu_bar::POPOVER_WINDOW, settings::SETTINGS_WINDOW])
                .build(),
        )
        .setup(|app| {
            #[cfg(debug_assertions)]
            name_dev_window(app);
            settings::setup(app)?;
            Ok(menu_bar::setup(app)?)
        })
        .on_window_event(menu_bar::on_window_event)
        .invoke_handler(tauri::generate_handler![
            menu_bar::quit_board,
            settings::load_settings,
            settings::save_settings,
            settings::pick_scan_root,
            settings::open_settings
        ])
        .build(tauri::generate_context!())
        .expect("error while building the Board")
        .run(|app, event| {
            if let tauri::RunEvent::Reopen { .. } = event {
                menu_bar::show_board(app);
            }
        });
}

/// Debug builds title the Board window with their dev-server port ("Board (dev :1432)"), so an
/// agent's dev app is told apart from the developer's own Board, and its window found by title.
#[cfg(debug_assertions)]
fn name_dev_window(app: &tauri::App) {
    use tauri::Manager;
    let (Some(url), Some(window)) = (&app.config().build.dev_url, app.get_webview_window("main")) else {
        return;
    };
    let _ = window.set_title(&dev_window_title(url));
}

#[cfg(debug_assertions)]
fn dev_window_title(dev_url: &tauri::Url) -> String {
    match dev_url.port_or_known_default() {
        Some(port) => format!("Board (dev :{port})"),
        None => "Board (dev)".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::dev_window_title;

    #[test]
    fn names_the_dev_window_by_its_port() {
        let url = tauri::Url::parse("http://localhost:1432").unwrap();
        assert_eq!(dev_window_title(&url), "Board (dev :1432)");
    }
}

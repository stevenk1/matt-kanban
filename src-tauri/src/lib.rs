// The thin Tauri shell. All Board logic lives in the TypeScript UI; the shell only
// grants it read access to the scan roots through the fs plugin, and lets it run the
// few read-only `gh` commands the GitHub port needs through the shell plugin, and
// opens a Ticket in VS Code or on GitHub through the opener plugin (see capabilities/).
// It also owns the menu-bar extra's tray icon and popover window (menu_bar.rs), and the
// Settings window, the Settings file and the scan roots added in Settings (settings.rs,
// scan_roots.rs), with "Settings…" in the app menu, and checks for and installs updates
// (updater.rs). A debug build titles its Board window by its dev-server port, opens in the state
// BOARD_DEV_START names (dev_start.rs) and, for a README screenshot shoot (BOARD_DEV_SHOOT), sets
// the app's appearance and reads only the dev scan root; a release build reads none of these
// variables.
#[cfg(debug_assertions)]
mod dev_start;
mod menu_bar;
mod scan_roots;
mod settings;
mod updater;

use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_window_state::StateFlags;

pub fn run() {
    let board = tauri::Builder::default()
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
        // Checked, downloaded and installed from Rust only (updater.rs): no capability grants it.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let shoot = shoot_theme_from_env();
            #[cfg(debug_assertions)]
            dress_dev_windows(app, shoot);
            settings::setup(app, shoot.is_some())?;
            updater::setup(app);
            menu_bar::setup(app)?;
            #[cfg(debug_assertions)]
            dev_start::setup(app);
            Ok(())
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
        .expect("error while building the Board");
    #[cfg(debug_assertions)]
    let board = dev_start::run_unfocused(board);
    board.run(|app, event| {
        if let tauri::RunEvent::Reopen { .. } = event {
            menu_bar::show_board(app);
        }
    });
}

/// Debug builds title the Board window with their dev-server port ("MattBoard (dev :1432)"), so an
/// agent's dev app is told apart from the developer's own Board, and its window found by title.
/// For a screenshot shoot (`shoot`, from BOARD_DEV_SHOOT=light|dark), the window is titled plain
/// "MattBoard" and every window of the app takes the shoot's appearance, whatever macOS's own is.
#[cfg(debug_assertions)]
fn dress_dev_windows(app: &tauri::App, shoot: Option<tauri::Theme>) {
    use tauri::Manager;
    if shoot.is_some() {
        app.set_theme(shoot);
    }
    let (Some(url), Some(window)) = (&app.config().build.dev_url, app.get_webview_window("main")) else {
        return;
    };
    let _ = window.set_title(&dev_window_title(url, shoot.is_some()));
}

/// BOARD_DEV_SHOOT's appearance, when it is `light` or `dark`; read in a debug build only.
#[cfg(debug_assertions)]
fn shoot_theme_from_env() -> Option<tauri::Theme> {
    let value = std::env::var("BOARD_DEV_SHOOT").ok()?;
    let theme = shoot_theme(&value);
    if theme.is_none() {
        eprintln!("Ignoring BOARD_DEV_SHOOT={value}: not light or dark");
    }
    theme
}

#[cfg(not(debug_assertions))]
fn shoot_theme_from_env() -> Option<tauri::Theme> {
    None
}

#[cfg(debug_assertions)]
fn shoot_theme(value: &str) -> Option<tauri::Theme> {
    match value {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    }
}

/// The Board window's title in a debug build: by its dev-server port, or plain "MattBoard" for a shoot.
#[cfg(debug_assertions)]
fn dev_window_title(dev_url: &tauri::Url, shooting: bool) -> String {
    if shooting {
        return "MattBoard".to_string();
    }
    match dev_url.port_or_known_default() {
        Some(port) => format!("MattBoard (dev :{port})"),
        None => "MattBoard (dev)".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{dev_window_title, shoot_theme};
    use tauri::Theme;

    #[test]
    fn names_the_dev_window_by_its_port() {
        let url = tauri::Url::parse("http://localhost:1432").unwrap();
        assert_eq!(dev_window_title(&url, false), "MattBoard (dev :1432)");
    }

    #[test]
    fn reads_light_or_dark_as_the_shoot_theme_and_nothing_else() {
        assert_eq!(shoot_theme("light"), Some(Theme::Light));
        assert_eq!(shoot_theme("dark"), Some(Theme::Dark));
        for value in ["", "Dark", "auto", " light"] {
            assert_eq!(shoot_theme(value), None, "accepted {value:?}");
        }
    }

    #[test]
    fn titles_the_dev_window_plain_board_for_a_shoot() {
        let url = tauri::Url::parse("http://localhost:1432").unwrap();
        assert_eq!(dev_window_title(&url, true), "MattBoard");
    }
}

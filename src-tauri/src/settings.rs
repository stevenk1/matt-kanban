// Settings' native half (spec, Implementation Decisions "Settings"). The UI keeps the Settings;
// this file stores them as JSON in one fixed file in the app's config directory, the only file
// the app writes (besides the window-state plugin's own file there, and the login item that
// "Open at login" registers). No capability grants the fs plugin any write permission: its scopes
// are shared by every fs command, so a write permission would reach every scan root too.
//
// It also grants read and watch access to the scan roots: no capability has a static fs scope, and
// there is no default scan root. Only folders the user picked in the folder dialog are granted, and
// only those can be saved as scan roots (scan_roots.rs), so the webview can't widen what it may
// read. And it adds "Settings…" (Cmd+,) to the app menu.
//
// In a debug build only, BOARD_DEV_SCAN_ROOT names a dev scan root, so a hand check can point the
// Board at a throwaway folder: it is granted like a picked folder, loaded as the first scan root
// and never saved. During a README screenshot shoot (BOARD_DEV_SHOOT, read in lib.rs) only the dev
// scan root is read, not the saved ones, and the Settings file is never written. A release build
// reads neither variable. BOARD_DEV_START=settings (dev_start.rs) opens the Settings window
// unfocused, through `show_settings_unfocused`.
// Checked by hand (spec, "Thin Tauri shell"), apart from scan_roots.rs's unit tests.
use crate::scan_roots::{scan_root, scan_roots_in, ScanRoots};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem};
use tauri::{App, AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

// A copy of SETTINGS_WINDOW in src/shell/window-protocol.ts; change them together.
pub const SETTINGS_WINDOW: &str = "settings";
const SETTINGS_FILE: &str = "settings.json";
const SETTINGS_MENU_ITEM: &str = "settings";

/// The scan roots that may be granted and saved.
struct AllowedScanRoots(Mutex<ScanRoots>);

/// Allows (in a debug build) the dev scan root, and puts "Settings…" in the app menu. During a
/// screenshot `shoot`, only the dev scan root is read and nothing is saved.
pub fn setup(app: &mut App, shoot: bool) -> tauri::Result<()> {
    let mut roots = ScanRoots::default();
    if let Some(dev) = dev_root_from_env() {
        roots = roots.with_dev_root(dev);
    }
    if shoot {
        roots = roots.for_a_shoot();
    }
    if let Some(dev) = roots.dev_root() {
        allow_scan_root(app.handle(), dev);
    }
    app.manage(AllowedScanRoots(Mutex::new(roots)));
    add_to_app_menu(app)
}

/// BOARD_DEV_SCAN_ROOT, when it names a clean absolute folder; read in a debug build only.
#[cfg(debug_assertions)]
fn dev_root_from_env() -> Option<PathBuf> {
    let value = std::env::var("BOARD_DEV_SCAN_ROOT").ok()?;
    let root = crate::scan_roots::dev_scan_root(Some(&value));
    if root.is_none() {
        eprintln!("Ignoring BOARD_DEV_SCAN_ROOT={value}: not a clean absolute path");
    }
    root
}

#[cfg(not(debug_assertions))]
fn dev_root_from_env() -> Option<PathBuf> {
    None
}

/// The saved Settings' text, or None before any were saved (with the dev scan root, if any, put
/// first among their scan roots). The scan roots in it are allowed and granted first, so the
/// Board can read them as soon as it has its Settings.
#[tauri::command]
pub fn load_settings<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    let path = settings_file(&app)?;
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => Some(text),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("Couldn't read {}: {error}", path.display())),
    };
    let mut allowed = allowed_scan_roots(&app);
    for root in text.as_deref().map(scan_roots_in).unwrap_or_default() {
        allowed.allow(root);
    }
    let Some(text) = allowed.loaded(text) else {
        return Ok(None);
    };
    for root in scan_roots_in(&text) {
        allow_scan_root(&app, &root);
    }
    Ok(Some(text))
}

/// Saves the Settings, replacing the file whole so a crash can't leave half of it. Refused when
/// a scan root in them is neither a folder picked in the folder dialog nor the dev
/// scan root; the dev scan root isn't saved.
#[tauri::command]
pub fn save_settings<R: Runtime>(app: AppHandle<R>, settings: serde_json::Value) -> Result<(), String> {
    let to_save = {
        let mut allowed = allowed_scan_roots(&app);
        allowed.accept_saved(&settings)?;
        allowed.to_save(settings)
    };
    let Some(settings) = to_save else {
        return Ok(());
    };
    let path = settings_file(&app)?;
    let text = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    let partial = path.with_extension("json.partial");
    let save = || -> std::io::Result<()> {
        std::fs::create_dir_all(path.parent().expect("the settings file is in a folder"))?;
        std::fs::write(&partial, text)?;
        std::fs::rename(&partial, &path)
    };
    save().map_err(|error| format!("Couldn't save {}: {error}", path.display()))
}

/// Asks for a folder to add as a scan root, as a sheet on the asking window, then allows and
/// grants it. None when the user cancels.
#[tauri::command]
pub async fn pick_scan_root<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Add a scan root")
        .set_parent(&window)
        .blocking_pick_folder();
    let Some(picked) = picked else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|error| error.to_string())?;
    let root = scan_root(&serde_json::Value::from(path.to_string_lossy()))
        .ok_or_else(|| format!("{} can't be a scan root", path.display()))?;
    allow_scan_root(&app, &root);
    allowed_scan_roots(&app).allow(root.clone());
    Ok(Some(root.to_string_lossy().into_owned()))
}

/// Shows the Settings window, from the popover's "Settings…".
#[tauri::command]
pub async fn open_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    show_settings(&app).map_err(|error| error.to_string())
}

/// Shows the Settings window, opening it first if it isn't open.
fn show_settings<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let window = match app.get_webview_window(SETTINGS_WINDOW) {
        Some(window) => window,
        None => settings_window(app).build()?,
    };
    window.unminimize()?;
    window.show()?;
    window.set_focus()
}

/// Opens the Settings window without taking focus, for BOARD_DEV_START=settings (dev_start.rs).
/// It opens behind the developer's windows, where WebKit wouldn't draw it unless told to.
#[cfg(debug_assertions)]
pub fn show_settings_unfocused<R: Runtime>(app: &AppHandle<R>) {
    use tauri::utils::config::BackgroundThrottlingPolicy;
    let window = settings_window(app)
        .focused(false)
        .background_throttling(BackgroundThrottlingPolicy::Disabled);
    if let Err(error) = window.build() {
        eprintln!("Couldn't open Settings: {error}");
    }
}

fn settings_window<R: Runtime>(app: &AppHandle<R>) -> WebviewWindowBuilder<'_, R, AppHandle<R>> {
    WebviewWindowBuilder::new(app, SETTINGS_WINDOW, WebviewUrl::App("settings.html".into()))
        .title("Settings")
        .inner_size(460.0, 560.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
}

/// macOS's standard menus (the app menu with About, Hide and Quit, then File, Edit, View, Window
/// and Help), with "Settings…" (Cmd+,) after About in the app menu, where Mac apps put it.
fn add_to_app_menu(app: &App) -> tauri::Result<()> {
    let menu = Menu::default(app.handle())?;
    let settings = MenuItemBuilder::with_id(SETTINGS_MENU_ITEM, "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    if let Some(app_menu) = menu.items()?.first().and_then(|item| item.as_submenu().cloned()) {
        // After "About Board" and its separator.
        app_menu.insert(&settings, 2)?;
        app_menu.insert(&PredefinedMenuItem::separator(app)?, 3)?;
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id() == SETTINGS_MENU_ITEM {
            if let Err(error) = show_settings(app) {
                eprintln!("Couldn't open Settings: {error}");
            }
        }
    });
    Ok(())
}

fn allowed_scan_roots<R: Runtime>(app: &AppHandle<R>) -> MutexGuard<'_, ScanRoots> {
    app.state::<AllowedScanRoots>().inner().0.lock().unwrap()
}

fn settings_file<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
    Ok(dir.join(SETTINGS_FILE))
}

/// Lets the fs plugin read and watch everything in `root` (it has no write permission to give).
/// The fs plugin checks the path with symlinks resolved, so a symlinked root's target is granted too.
fn allow_scan_root<R: Runtime>(app: &AppHandle<R>, root: &Path) {
    let scope = app.fs_scope();
    let mut paths = vec![root.to_path_buf()];
    if let Ok(real) = std::fs::canonicalize(root) {
        if real != root {
            paths.push(real);
        }
    }
    for path in paths {
        if let Err(error) = scope.allow_directory(&path, true) {
            eprintln!("Couldn't allow reading {}: {error}", path.display());
        }
    }
}

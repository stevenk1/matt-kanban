// The menu-bar extra's native half: the tray icon, and showing and hiding the popover window
// under it. The UI sets the icon's title (the Ready count) and fills the popover; see
// src/shell/menu-bar.ts. BOARD_DEV_START=popover (dev_start.rs) shows the popover through
// `show_popover` too. Checked by hand (spec, "Thin Tauri shell").
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, Window, WindowEvent};
use tauri_plugin_positioner::{Position, WindowExt};

// The tray id and the window labels are copies of those in src/shell/window-protocol.ts (and
// tauri.conf.json); change them together.
/// The tray icon's id; the UI finds the icon by it to set its title.
pub const TRAY_ID: &str = "ready";
pub const BOARD_WINDOW: &str = "main";
pub const POPOVER_WINDOW: &str = "popover";

/// When losing focus last hid the popover. Clicking the tray icon takes focus from an open
/// popover before the click arrives, so a click right after that hide is the one that caused
/// it: it should close the popover, not reopen it.
struct PopoverHiddenAt(Mutex<Option<Instant>>);

const SAME_CLICK: Duration = Duration::from_millis(300);

/// Adds the tray icon. Its title stays empty until the UI has read the Board.
pub fn setup(app: &mut App) -> tauri::Result<()> {
    app.manage(PopoverHiddenAt(Mutex::new(None)));
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(tauri::include_image!("icons/tray.png"))
        .icon_as_template(true)
        .tooltip("Ready Tickets")
        .on_tray_icon_event(|tray, event| {
            // Records where the icon is, so the popover can be placed under it.
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_popover(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// The popover hides when it loses focus, like a menu. Closing the Board window only hides it,
/// so its UI keeps reading the Board and the tray count stays current.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    match (window.label(), event) {
        (POPOVER_WINDOW, WindowEvent::Focused(false)) => {
            *window.state::<PopoverHiddenAt>().0.lock().unwrap() = Some(Instant::now());
            log_failure("hide the popover", window.hide());
        }
        (BOARD_WINDOW, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            log_failure("hide the Board window", window.hide());
        }
        _ => {}
    }
}

/// Brings the Board window back, e.g. when the Dock icon is clicked after it was closed.
pub fn show_board<R: Runtime>(app: &AppHandle<R>) {
    if let Some(board) = app.get_webview_window(BOARD_WINDOW) {
        log_failure("show the Board window", board.show());
        log_failure("focus the Board window", board.set_focus());
    }
}

/// Quits the app, from the popover's "Quit MattBoard": closing the Board window only hides it.
#[tauri::command]
pub fn quit_board<R: Runtime>(app: AppHandle<R>) {
    app.exit(0);
}

fn toggle_popover<R: Runtime>(app: &AppHandle<R>) {
    let Some(popover) = app.get_webview_window(POPOVER_WINDOW) else {
        return;
    };
    if popover.is_visible().unwrap_or(false) {
        log_failure("hide the popover", popover.hide());
        return;
    }
    let hidden_at = *app.state::<PopoverHiddenAt>().0.lock().unwrap();
    if hidden_at.is_some_and(|at| at.elapsed() < SAME_CLICK) {
        return;
    }
    show_popover(&popover, Position::TrayBottomCenter);
    log_failure("focus the popover", popover.set_focus());
}

/// Places the popover at `position` (kept on screen when under the tray icon) and shows it.
/// Showing makes it the app's key window but doesn't bring the app forward: only `set_focus`
/// takes focus from another app.
pub fn show_popover<R: Runtime>(popover: &WebviewWindow<R>, position: Position) {
    log_failure("place the popover", popover.move_window_constrained(position));
    log_failure("show the popover", popover.show());
}

fn log_failure(action: &str, result: tauri::Result<()>) {
    if let Err(error) = result {
        eprintln!("Couldn't {action}: {error}");
    }
}

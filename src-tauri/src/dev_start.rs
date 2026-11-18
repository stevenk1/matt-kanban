// In a debug build only (lib.rs leaves this module out of a release build), BOARD_DEV_START opens
// the app in a named state, so a hand check needs no temporary startup code: `settings` opens the
// Settings window, `popover` the popover, and `ticket:<id>` that Ticket's detail in the Board
// window. Focus stays with the developer (docs/agents/dev-loop.md, "Checking by hand"): macOS
// brings an app forward as it finishes launching, and again whenever it shows a window, so with a
// start state the app runs as one that can never come forward, without a Dock icon. A bad value is
// ignored with a line on stderr, and the app starts as usual.
// Checked by hand (spec, "Thin Tauri shell"), apart from `dev_start`'s unit tests.
use crate::{menu_bar, settings};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::tray::TrayIconEvent;
use tauri::{ActivationPolicy, App, AppHandle, Emitter, Listener, Manager, Rect, Runtime};
use tauri_plugin_positioner::Position;

// Copies of the event names in src/shell/window-protocol.ts; change them together.
/// From the Board window, once it listens for `REVEAL`.
const READY: &str = "dev-start:ready";
/// To the Board window: open on this Ticket id, leaving focus where it is.
const REVEAL: &str = "dev-start:reveal";

/// How often, and how many times, to look whether the menu bar has placed the tray icon.
const TRAY_PLACED_POLL: Duration = Duration::from_millis(100);
const TRAY_PLACED_TRIES: u32 = 30;

/// A state the app can start in.
#[derive(Debug, PartialEq)]
pub enum DevStart {
    Settings,
    Popover,
    /// A Ticket, by its id on the Board: `<Project folder>/<feature folder>/<NN>` for a local
    /// Ticket, `<Project folder>/#<feature issue>/#<issue>` for a GitHub one, and
    /// `<Project folder>/no-feature/#<issue>` for a GitHub one with no Feature issue.
    Ticket(String),
}

/// The state BOARD_DEV_START's value names: `settings`, `popover` or `ticket:<id>`, spelled
/// exactly.
pub fn dev_start(value: &str) -> Option<DevStart> {
    match value {
        "settings" => Some(DevStart::Settings),
        "popover" => Some(DevStart::Popover),
        _ => value
            .strip_prefix("ticket:")
            .filter(|id| !id.trim().is_empty())
            .map(|id| DevStart::Ticket(id.to_string())),
    }
}

/// With a start state, keeps the app from ever coming forward. Called before the app runs.
pub fn run_unfocused(mut app: App) -> App {
    if start().is_some() {
        app.set_activation_policy(ActivationPolicy::Prohibited);
    }
    app
}

/// Opens the state BOARD_DEV_START names, if any. Called once the tray icon exists.
pub fn setup(app: &App) {
    let Some(start) = start() else {
        return;
    };
    match start {
        DevStart::Settings => settings::show_settings_unfocused(app.handle()),
        DevStart::Popover => show_popover_unfocused(app.handle()),
        DevStart::Ticket(id) => {
            let id = id.clone();
            // Each time the Board window (re)loads and listens, it is told again.
            let handle = app.handle().clone();
            app.listen_any(READY, move |_| {
                if let Err(error) = handle.emit_to(menu_bar::BOARD_WINDOW, REVEAL, &id) {
                    eprintln!("Couldn't reveal Ticket {id}: {error}");
                }
            });
        }
    }
}

/// Shows the popover under the tray icon without taking focus. Nothing has clicked the icon yet,
/// so its place is read from the icon itself, once the menu bar has placed it: until then, and
/// when the bar is too full to show it, the icon reports the screen's left edge. An icon that
/// isn't placed leaves the popover at the screen's top right.
fn show_popover_unfocused<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(menu_bar::TRAY_ID) else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        let placed = (0..TRAY_PLACED_TRIES).find_map(|try_number| {
            if try_number > 0 {
                std::thread::sleep(TRAY_PLACED_POLL);
            }
            tray.rect().ok().flatten().filter(is_placed)
        });
        let tray_id = tray.id().clone();
        let handle = app.clone();
        let shown = app.run_on_main_thread(move || {
            let Some(popover) = handle.get_webview_window(menu_bar::POPOVER_WINDOW) else {
                return;
            };
            let position = match placed {
                Some(rect) => {
                    let event = TrayIconEvent::Move { id: tray_id, position: rect.position.to_physical(1.0), rect };
                    tauri_plugin_positioner::on_tray_event(&handle, &event);
                    Position::TrayBottomCenter
                }
                None => {
                    eprintln!("The menu bar didn't place the tray icon: showing the popover at the screen's top right");
                    Position::TopRight
                }
            };
            menu_bar::show_popover(&popover, position);
        });
        if let Err(error) = shown {
            eprintln!("Couldn't show the popover: {error}");
        }
    });
}

/// Whether the menu bar has placed the tray icon whose place is `rect`.
fn is_placed(rect: &Rect) -> bool {
    rect.position.to_physical::<f64>(1.0).x != 0.0 && rect.size.to_physical::<f64>(1.0).height > 0.0
}

/// The start state, read from the environment once.
fn start() -> Option<&'static DevStart> {
    static START: OnceLock<Option<DevStart>> = OnceLock::new();
    START.get_or_init(from_env).as_ref()
}

/// BOARD_DEV_START, when it names a state.
fn from_env() -> Option<DevStart> {
    let value = std::env::var("BOARD_DEV_START").ok()?;
    let start = dev_start(&value);
    if start.is_none() {
        eprintln!("Ignoring BOARD_DEV_START={value}: not settings, popover or ticket:<id>");
    }
    start
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_settings_window() {
        assert_eq!(dev_start("settings"), Some(DevStart::Settings));
    }

    #[test]
    fn names_the_popover() {
        assert_eq!(dev_start("popover"), Some(DevStart::Popover));
    }

    #[test]
    fn names_a_ticket_by_its_id() {
        assert_eq!(dev_start("ticket:matt-kanban/dev-start/12"), Some(DevStart::Ticket("matt-kanban/dev-start/12".to_string())));
        assert_eq!(dev_start("ticket:alpha/#3/#41"), Some(DevStart::Ticket("alpha/#3/#41".to_string())));
        assert_eq!(dev_start("ticket:alpha/no-feature/#7"), Some(DevStart::Ticket("alpha/no-feature/#7".to_string())));
    }

    #[test]
    fn rejects_anything_else() {
        for value in ["", "Settings", " popover", "board", "ticket", "ticket:", "ticket:  "] {
            assert_eq!(dev_start(value), None, "accepted {value:?}");
        }
    }
}

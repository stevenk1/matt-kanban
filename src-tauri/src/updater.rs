// The Board updating itself (ADR 0002): at launch and every 24 hours after, the shell asks the
// GitHub Releases' latest.json (plugins.updater in tauri.conf.json) for a newer version. A check
// that fails (no network yet at login) is tried again at the next hourly wake. When there is a
// newer version, a native dialog asks "Board X is available. Install and restart?": Install
// downloads it, checks its signature against the public key, installs it and restarts, or says
// why it couldn't; Later just dismisses it, and the next check asks again. All of it runs here, so
// no capability grants a window any updater permission (a test in src/invariants.test.ts keeps it
// so). Debug builds never check. Checked by hand, apart from the unit tests below.
use std::time::{Duration, SystemTime};
use tauri::{App, AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

const HOUR: Duration = Duration::from_secs(60 * 60);
const CHECK_EVERY: Duration = Duration::from_secs(24 * HOUR.as_secs());
/// How often the checking thread wakes to see whether a check is due. Its sleep stops while the
/// Mac sleeps, so it compares wall-clock times rather than sleeping 24 hours in one go.
const WAKE_EVERY: Duration = HOUR;

/// Starts checking for updates, in a release build.
pub fn setup<R: Runtime>(app: &App<R>) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.handle().clone();
    std::thread::spawn(move || {
        let mut schedule = CheckSchedule::default();
        loop {
            let now = SystemTime::now();
            if schedule.is_due(now) {
                let result = tauri::async_runtime::block_on(offer_update(&app));
                if let Err(error) = &result {
                    eprintln!("Update check failed: {error}");
                }
                schedule.checked(now, result.is_ok());
            }
            std::thread::sleep(WAKE_EVERY);
        }
    });
}

/// When the last successful check was, and so whether a check is due.
#[derive(Default)]
struct CheckSchedule {
    last_success: Option<SystemTime>,
}

impl CheckSchedule {
    /// Due at launch, then once `CHECK_EVERY` has passed since the last successful check (or the
    /// clock was set back before it).
    fn is_due(&self, now: SystemTime) -> bool {
        self.last_success
            .is_none_or(|last| now.duration_since(last).map_or(true, |elapsed| elapsed >= CHECK_EVERY))
    }

    /// Records a check made at `at`. Only a successful one counts: a failed one stays due.
    fn checked(&mut self, at: SystemTime, succeeded: bool) {
        if succeeded {
            self.last_success = Some(at);
        }
    }
}

/// Checks for a newer version and, if there is one and the user says Install, installs it and
/// restarts the Board. Only a failed check is an error: a failed install is shown to the user
/// (and logged), and the next check offers the version again.
async fn offer_update<R: Runtime>(app: &AppHandle<R>) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    let install = app
        .dialog()
        .message(update_prompt(&update.version))
        .title("Update available")
        .buttons(MessageDialogButtons::OkCancelCustom("Install".into(), "Later".into()))
        .blocking_show();
    if !install {
        return Ok(());
    }
    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => app.restart(),
        Err(error) => {
            eprintln!("Update install failed: {error}");
            app.dialog()
                .message(install_failure(&error.to_string()))
                .title("Update failed")
                .kind(MessageDialogKind::Error)
                .blocking_show();
            Ok(())
        }
    }
}

fn update_prompt(version: &str) -> String {
    format!("Board {version} is available. Install and restart?")
}

fn install_failure(reason: &str) -> String {
    format!("Board couldn't install the update: {reason}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn asks_to_install_the_found_version() {
        assert_eq!(update_prompt("0.2.0"), "Board 0.2.0 is available. Install and restart?");
    }

    #[test]
    fn says_why_the_update_could_not_be_installed() {
        assert_eq!(
            install_failure("Read-only file system"),
            "Board couldn't install the update: Read-only file system"
        );
    }

    #[test]
    fn checks_at_launch() {
        assert!(CheckSchedule::default().is_due(SystemTime::now()));
    }

    #[test]
    fn checks_again_24_hours_after_the_last_check() {
        let last = SystemTime::UNIX_EPOCH + 1000 * HOUR;
        let mut schedule = CheckSchedule::default();
        schedule.checked(last, true);

        assert!(!schedule.is_due(last + 23 * HOUR));
        assert!(schedule.is_due(last + 24 * HOUR));
        assert!(schedule.is_due(last + 30 * HOUR));
    }

    #[test]
    fn retries_a_failed_check_at_the_next_wake() {
        let launch = SystemTime::UNIX_EPOCH + 1000 * HOUR;
        let mut schedule = CheckSchedule::default();

        schedule.checked(launch, false);
        assert!(schedule.is_due(launch + WAKE_EVERY));

        schedule.checked(launch + WAKE_EVERY, true);
        assert!(!schedule.is_due(launch + 2 * WAKE_EVERY));
    }

    #[test]
    fn checks_when_the_clock_was_set_back_before_the_last_check() {
        let last = SystemTime::UNIX_EPOCH + 1000 * HOUR;
        let mut schedule = CheckSchedule::default();
        schedule.checked(last, true);

        assert!(schedule.is_due(last - HOUR));
    }
}

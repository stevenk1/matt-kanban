// Which folders the Board may be granted to read as scan roots: those the user picked in a folder
// dialog (in Settings, or the Board's own while it has none) and, in a debug build only, the dev
// scan root named by BOARD_DEV_SCAN_ROOT (settings.rs reads it). The Settings file is the list's
// record across launches: only the app writes it, and only after `accept_saved` has checked its
// scan roots, so the roots in it were all picked. There is no default scan root. The dev scan root
// isn't written to it (it comes from the environment on each launch) unless it was also picked.
// During a README screenshot shoot (debug only), the saved scan roots aren't read and nothing is
// written, so the developer's own Projects stay out of the shots.
// Kept apart from the Tauri commands in settings.rs so it can be unit-tested.
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

#[derive(Default)]
pub struct ScanRoots {
    dev: Option<PathBuf>,
    picked: BTreeSet<PathBuf>,
    /// A screenshot shoot (BOARD_DEV_SHOOT, lib.rs): only the dev scan root is read.
    shoot: bool,
}

impl ScanRoots {
    /// Also allows the dev scan root, `dev`, which loading puts first among the scan roots and
    /// saving leaves out, unless it was also picked.
    pub fn with_dev_root(mut self, dev: PathBuf) -> Self {
        self.dev = Some(dev);
        self
    }

    /// For a screenshot shoot: loading leaves out the saved scan roots, so only the dev scan root
    /// (if any) is read and none of the developer's own Projects shows.
    pub fn for_a_shoot(mut self) -> Self {
        self.shoot = true;
        self
    }

    pub fn dev_root(&self) -> Option<&Path> {
        self.dev.as_deref()
    }

    /// Allows `root`, picked in the folder dialog or read from the Settings file.
    pub fn allow(&mut self, root: PathBuf) {
        self.picked.insert(root);
    }

    /// The scan roots in the Settings about to be saved, when each is allowed; there may be none.
    /// Afterwards only those stay allowed, so a root removed in Settings must be picked again.
    pub fn accept_saved(&mut self, settings: &Value) -> Result<Vec<PathBuf>, String> {
        let entries = settings
            .get("scanRoots")
            .and_then(Value::as_array)
            .ok_or("The Settings have no scan roots")?;
        let mut roots = Vec::new();
        for entry in entries {
            let root = scan_root(entry).ok_or_else(|| format!("{entry} isn't a folder's absolute path"))?;
            if !self.is_dev(&root) && !self.picked.contains(&root) {
                return Err(format!("{} wasn't picked as a scan root", root.display()));
            }
            roots.push(root);
        }
        self.picked = roots
            .iter()
            .filter(|root| !self.is_dev(root) || self.picked.contains(*root))
            .cloned()
            .collect();
        Ok(roots)
    }

    fn is_dev(&self, root: &Path) -> bool {
        self.dev.as_deref() == Some(root)
    }

    /// The Settings file's text (None when there is none) as the Board should load it: with the
    /// dev scan root first among the scan roots, followed by the saved ones, which a shoot leaves
    /// out. Unchanged without a dev scan root or a shoot.
    pub fn loaded(&self, text: Option<String>) -> Option<String> {
        if self.dev.is_none() && !self.shoot {
            return text;
        }
        let mut settings = text
            .as_deref()
            .and_then(|text| serde_json::from_str::<Value>(text).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        let saved = match (&text, self.shoot) {
            (Some(text), false) => scan_roots_in(text),
            _ => vec![],
        };
        let roots: Vec<PathBuf> =
            self.dev.iter().cloned().chain(saved.into_iter().filter(|root| !self.is_dev(root))).collect();
        settings["scanRoots"] = json!(roots);
        Some(settings.to_string())
    }

    /// `settings`, once accepted, as they should be written to the Settings file: without the dev
    /// scan root, unless it was also picked (or saved before). None during a shoot, which leaves
    /// the Settings file as it was.
    pub fn to_save(&self, mut settings: Value) -> Option<Value> {
        if self.shoot {
            return None;
        }
        let Some(dev) = self.dev.as_ref().filter(|dev| !self.picked.contains(*dev)) else {
            return Some(settings);
        };
        if let Some(entries) = settings.get_mut("scanRoots").and_then(Value::as_array_mut) {
            entries.retain(|entry| scan_root(entry).as_ref() != Some(dev));
        }
        Some(settings)
    }
}

/// The dev scan root named by the BOARD_DEV_SCAN_ROOT variable's value, when it is a clean
/// absolute path (see `scan_root`). Only a debug build reads the variable.
#[cfg_attr(not(debug_assertions), allow(dead_code))]
pub fn dev_scan_root(value: Option<&str>) -> Option<PathBuf> {
    scan_root(&Value::from(value?))
}

/// The scan roots in a saved Settings file's text; entries that aren't one are skipped, as the
/// UI skips them.
pub fn scan_roots_in(text: &str) -> Vec<PathBuf> {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|settings| settings.get("scanRoots").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(scan_root)
        .collect()
}

/// `value` as a scan root: an absolute path, without trailing slashes, and with no empty, `.`
/// or `..` parts. Stricter than the UI's check (src/ui/settings.ts), which only strips
/// trailing slashes, so nothing the UI drops gets through here.
pub fn scan_root(value: &Value) -> Option<PathBuf> {
    let path = value.as_str()?;
    if !path.starts_with('/') {
        return None;
    }
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() {
        return Some(PathBuf::from("/"));
    }
    let clean = trimmed[1..].split('/').all(|part| !matches!(part, "" | "." | ".."));
    clean.then(|| PathBuf::from(trimmed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn roots() -> ScanRoots {
        ScanRoots::default()
    }

    fn saved(roots: &[&str]) -> Value {
        json!({ "scanRoots": roots, "hiddenProjects": [], "doneWindowDays": 14 })
    }

    #[test]
    fn accepts_picked_roots() {
        let mut roots = roots();
        roots.allow(PathBuf::from("/Users/dev/repo"));
        roots.allow(PathBuf::from("/Users/dev/work"));

        let accepted = roots.accept_saved(&saved(&["/Users/dev/repo", "/Users/dev/work/"]));

        assert_eq!(accepted, Ok(vec![PathBuf::from("/Users/dev/repo"), PathBuf::from("/Users/dev/work")]));
    }

    #[test]
    fn rejects_a_root_that_was_not_picked() {
        let mut roots = roots();

        let accepted = roots.accept_saved(&saved(&["/"]));

        assert_eq!(accepted, Err("/ wasn't picked as a scan root".to_string()));
    }

    #[test]
    fn forgets_a_root_once_settings_without_it_are_saved() {
        let mut roots = roots();
        roots.allow(PathBuf::from("/Users/dev/repo"));
        roots.allow(PathBuf::from("/Users/dev/work"));
        roots.accept_saved(&saved(&["/Users/dev/repo"])).unwrap();

        let accepted = roots.accept_saved(&saved(&["/Users/dev/repo", "/Users/dev/work"]));

        assert!(accepted.is_err());
    }

    #[test]
    fn accepts_settings_with_no_scan_roots_and_then_forgets_every_root() {
        let mut roots = roots();
        roots.allow(PathBuf::from("/Users/dev/work"));

        assert_eq!(roots.accept_saved(&saved(&[])), Ok(vec![]));
        assert!(roots.accept_saved(&saved(&["/Users/dev/work"])).is_err());
    }

    #[test]
    fn rejects_settings_without_scan_roots() {
        assert!(roots().accept_saved(&json!({ "doneWindowDays": 14 })).is_err());
    }

    #[test]
    fn rejects_entries_that_are_not_a_clean_absolute_path() {
        for entry in [json!("relative/path"), json!("/Users/dev/repo/../.."), json!("/Users//dev"), json!("/a/./b"), json!(42)] {
            let mut roots = roots();
            let settings = json!({ "scanRoots": [entry] });
            assert!(roots.accept_saved(&settings).is_err(), "accepted {entry}");
        }
    }

    fn with_dev() -> ScanRoots {
        roots().with_dev_root(PathBuf::from("/Users/dev/repo/.retro-dev-root"))
    }

    #[test]
    fn accepts_a_clean_absolute_dev_root_and_rejects_others() {
        assert_eq!(dev_scan_root(Some("/Users/dev/scratch/")), Some(PathBuf::from("/Users/dev/scratch")));
        for value in [None, Some(""), Some("relative/path"), Some("/Users/dev/../x"), Some("/a//b")] {
            assert_eq!(dev_scan_root(value), None, "accepted {value:?}");
        }
    }

    #[test]
    fn makes_the_dev_root_the_only_scan_root_when_nothing_is_saved() {
        let loaded: Value = serde_json::from_str(&with_dev().loaded(None).unwrap()).unwrap();

        assert_eq!(loaded, json!({ "scanRoots": ["/Users/dev/repo/.retro-dev-root"] }));
    }

    #[test]
    fn puts_the_dev_root_first_before_the_saved_roots_keeping_the_other_settings() {
        let text = saved(&["/Users/dev/work", "/Users/dev/repo/.retro-dev-root"]).to_string();

        let loaded: Value = serde_json::from_str(&with_dev().loaded(Some(text)).unwrap()).unwrap();

        assert_eq!(loaded, saved(&["/Users/dev/repo/.retro-dev-root", "/Users/dev/work"]));
    }

    #[test]
    fn loads_the_settings_unchanged_without_a_dev_root() {
        assert_eq!(roots().loaded(None), None);
        assert_eq!(roots().loaded(Some("not json".to_string())), Some("not json".to_string()));
    }

    #[test]
    fn accepts_the_dev_root_but_leaves_it_out_of_what_is_saved() {
        let mut roots = with_dev();
        roots.allow(PathBuf::from("/Users/dev/repo"));
        let settings = saved(&["/Users/dev/repo/.retro-dev-root", "/Users/dev/repo"]);

        assert!(roots.accept_saved(&settings).is_ok());
        assert_eq!(roots.to_save(settings), Some(saved(&["/Users/dev/repo"])));
        assert!(roots.accept_saved(&saved(&["/Users/dev/repo/.retro-dev-root"])).is_ok());
    }

    #[test]
    fn keeps_saving_a_dev_root_that_was_also_picked() {
        let mut roots = with_dev();
        roots.allow(PathBuf::from("/Users/dev/repo/.retro-dev-root"));
        roots.allow(PathBuf::from("/Users/dev/repo"));
        let settings = saved(&["/Users/dev/repo/.retro-dev-root", "/Users/dev/repo"]);

        roots.accept_saved(&settings).unwrap();

        assert_eq!(roots.to_save(settings.clone()), Some(settings.clone()));
        assert_eq!(roots.to_save(settings.clone()), Some(settings), "still picked after a save");
    }

    #[test]
    fn a_shoot_loads_only_the_dev_root_keeping_the_other_settings() {
        let text = saved(&["/Users/dev/work", "/Users/dev/repo"]).to_string();

        let loaded: Value = serde_json::from_str(&with_dev().for_a_shoot().loaded(Some(text)).unwrap()).unwrap();

        assert_eq!(loaded, saved(&["/Users/dev/repo/.retro-dev-root"]));
    }

    #[test]
    fn a_shoot_without_a_dev_root_loads_no_scan_roots() {
        let text = saved(&["/Users/dev/work"]).to_string();

        let loaded: Value = serde_json::from_str(&roots().for_a_shoot().loaded(Some(text)).unwrap()).unwrap();

        assert_eq!(loaded, saved(&[]));
    }

    #[test]
    fn a_shoot_saves_nothing() {
        let mut roots = with_dev().for_a_shoot();
        let settings = saved(&["/Users/dev/repo/.retro-dev-root"]);
        roots.accept_saved(&settings).unwrap();

        assert_eq!(roots.to_save(settings), None);
    }

    #[test]
    fn reads_the_scan_roots_of_a_saved_file_skipping_what_is_not_one() {
        let text = r#"{ "scanRoots": ["/Users/dev/repo", "/Users/dev/work/", "../up", 7] }"#;

        assert_eq!(scan_roots_in(text), vec![PathBuf::from("/Users/dev/repo"), PathBuf::from("/Users/dev/work")]);
        assert_eq!(scan_roots_in("not json"), Vec::<PathBuf>::new());
    }
}

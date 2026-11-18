fn main() {
    // The app's own commands. Listing them makes each one a permission (allow-quit-board, …)
    // that only the windows whose capability names it may call; unlisted, every window could
    // call every command.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "quit_board",
            "load_settings",
            "save_settings",
            "pick_scan_root",
            "open_settings",
        ]),
    ))
    .expect("failed to run tauri-build");
}

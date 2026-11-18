// The opener port: how the Board view opens a Ticket outside the app. The shell implements
// it with Tauri's opener plugin; UI tests pass a stub and check the URL it was given.

export interface Opener {
  /** Opens a `vscode://file/` URL in VS Code, or a GitHub URL in the default browser. */
  openUrl(url: string): void;
}

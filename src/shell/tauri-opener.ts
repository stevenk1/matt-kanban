// The Tauri implementation of the opener port: the opener plugin hands the URL to macOS,
// which opens vscode://file/ URLs in VS Code and GitHub URLs in the default browser.
// The app's capabilities (src-tauri/capabilities/default.json) allow only those two kinds.
import { openUrl } from '@tauri-apps/plugin-opener';
import type { Opener } from '../ui/opener';

export const tauriOpener: Opener = {
  openUrl(url) {
    openUrl(url).catch((error: unknown) => console.error(`Couldn't open ${url}:`, error));
  },
};

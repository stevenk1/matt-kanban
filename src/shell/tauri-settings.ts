// The Tauri adapters for Settings: loading and saving them and picking a scan root, all commands
// in src-tauri/src/settings.rs, which also grant the fs plugin read access to the scan roots and
// refuse to save one that wasn't picked. Checked by hand, not by automated tests (spec, "Thin
// Tauri shell").
import { invoke } from '@tauri-apps/api/core';
import { messageOf } from '../board/errors';
import { settingsFromFile, type Settings } from '../ui/settings';
import { logFailure } from './log-failure';

/**
 * The saved Settings, or the defaults for those not saved. Loading also grants reading the saved
 * scan roots, so call it before reading the Board. A file that can't be read gives the defaults.
 */
export async function loadSettings(): Promise<Settings> {
  const loading = invoke<string | null>('load_settings');
  logFailure('load the Settings, so the defaults are used', loading);
  const text = await loading.catch(() => null);
  return settingsFromFile(text);
}

/** Saves the Settings; refused when a scan root in them wasn't picked with `pickScanRoot`. */
export function saveSettings(settings: Settings): Promise<void> {
  return invoke('save_settings', { settings });
}

/** What asking for a scan root gave: the folder (null when the user cancels), or why it failed. */
export type PickedScanRoot = { folder: string | null; error: string | null };

/**
 * Asks for a folder to add as a scan root and grants reading it. A failure comes back as the
 * message both the Board's and Settings' Add Folder show.
 */
export async function pickScanRoot(): Promise<PickedScanRoot> {
  try {
    return { folder: await invoke<string | null>('pick_scan_root'), error: null };
  } catch (error) {
    return { folder: null, error: `Couldn't add the folder: ${messageOf(error)}` };
  }
}

// The Settings window's Board-window half. Every Board the window reads sends its Projects to the
// Settings window, so hidden Projects can be picked from the ones found; the Settings window's
// saved changes come back here, for the Board to be read with them. The Settings window renders
// src/shell/SettingsApp.tsx. Checked by hand (spec, "Thin Tauri shell").
import type { UnlistenFn } from '@tauri-apps/api/event';
import type { Board } from '../board/board';
import type { ProjectRef, Settings } from '../ui/settings';
import { subscribe } from './board-events';
import { logFailure } from './log-failure';
import { emitToWindow, listenFor, SETTINGS_WINDOW } from './window-protocol';

/** Tells the Settings window, if it is open, about Settings the Board window saved itself. */
export function sendSavedSettings(settings: Settings) {
  logFailure('send the Settings to Settings', emitToWindow(SETTINGS_WINDOW, 'settings:saved', settings));
}

/** Starts the link from the Board window: `onChange` gets the Settings each time they are saved. Returns the stop. */
export function startSettingsLink(onChange: (settings: Settings) => void): () => void {
  let latest: ProjectRef[] | null = null;
  const sendToSettings = (projects: ProjectRef[]) =>
    logFailure('send the Projects to Settings', emitToWindow(SETTINGS_WINDOW, 'settings:projects', projects));

  const unsubscribe = subscribe((board: Board) => {
    latest = board.projects.map(({ name, dir }) => ({ name, dir }));
    sendToSettings(latest);
  });
  const unlistens: Promise<UnlistenFn>[] = [
    listenFor('settings:ready', () => latest && sendToSettings(latest)),
    listenFor('settings:changed', onChange),
  ];

  return () => {
    unsubscribe();
    for (const unlisten of unlistens) void unlisten.then((stop) => stop());
  };
}

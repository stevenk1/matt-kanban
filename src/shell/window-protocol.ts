// What the Board window, the popover window, the Settings window and the native shell agree on:
// the window labels, the tray icon's id, the popover's width and the events between the windows.
// src-tauri/tauri.conf.json (windows), src-tauri/src/menu_bar.rs and src-tauri/src/settings.rs
// keep their own copies of the labels, the tray id and the width, and src-tauri/src/dev_start.rs
// of the dev-start events; change them together.
import { emit, emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Board } from '../board/board';
import type { ProjectRef, Settings } from '../ui/settings';

/** The window labels, as in tauri.conf.json, menu_bar.rs and settings.rs. */
export const BOARD_WINDOW = 'main';
export const POPOVER_WINDOW = 'popover';
export const SETTINGS_WINDOW = 'settings';

/** The tray icon's id, as menu_bar.rs creates it. */
export const TRAY_ID = 'ready';

/** The popover window's width, as in tauri.conf.json; its height follows its content. */
export const POPOVER_WIDTH = 320;

/** Each event between the windows, with its payload. */
export type WindowEvents = {
  /** To the popover: the latest Board. */
  'menu-bar:board': Board;
  /** To the Board window, once the popover listens: send it the latest Board. */
  'menu-bar:popover-ready': null;
  /** To the Board window: open on this Ticket id. */
  'menu-bar:reveal': string;
  /** To the Board window: come forward. */
  'menu-bar:open-board': null;
  /** To the Settings window: the Projects on the latest Board. */
  'settings:projects': ProjectRef[];
  /** To the Board window, once the Settings window listens: send it the latest Board's Projects. */
  'settings:ready': null;
  /** To the Board window: the Settings just saved; read the Board with them. */
  'settings:changed': Settings;
  /** To the Settings window: the Settings the Board window just saved; show them. */
  'settings:saved': Settings;
  /** To the native shell, once the Board window listens for dev-start:reveal (debug builds only). */
  'dev-start:ready': null;
  /** To the Board window, from BOARD_DEV_START=ticket:<id>: open on this Ticket id, leaving focus where it is. */
  'dev-start:reveal': string;
};

export type WindowEvent = keyof WindowEvents;

export function emitToWindow<E extends WindowEvent>(window: string, event: E, payload: WindowEvents[E]) {
  return emitTo(window, event, payload);
}

/** Sends `event` to the native shell (src-tauri/), which listens for it there. */
export function emitToShell<E extends WindowEvent>(event: E, payload: WindowEvents[E]) {
  return emit(event, payload);
}

export function listenFor<E extends WindowEvent>(
  event: E,
  handler: (payload: WindowEvents[E]) => void,
): Promise<UnlistenFn> {
  return listen<WindowEvents[E]>(event, ({ payload }) => handler(payload));
}

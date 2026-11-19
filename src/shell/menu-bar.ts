// The menu-bar extra's Board-window half. Every Board the window reads sets the tray icon's title
// to the Ready count and goes to the popover window; the popover's clicks come back here to bring
// the window forward. The tray icon and showing the popover are native (src-tauri/src/menu_bar.rs);
// the popover window renders src/shell/PopoverApp.tsx. Checked by hand (spec, "Thin Tauri shell").
import type { UnlistenFn } from '@tauri-apps/api/event';
import { TrayIcon } from '@tauri-apps/api/tray';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { hasScanRoot, type Board } from '../board/board';
import { countIn } from '../ui/ticket-counts';
import { subscribe } from './board-events';
import { logFailure } from './log-failure';
import { emitToWindow, listenFor, POPOVER_WINDOW, TRAY_ID } from './window-protocol';

/**
 * Starts the menu-bar extra from the Board window: `onReveal` is called with the id of a Ticket
 * clicked in the popover, after the window is brought forward. Returns the stop.
 */
export function startMenuBar(onReveal: (ticketId: string) => void): () => void {
  let latest: Board | null = null;
  // Looked up once. Never closed: closing a tray handle removes the icon from the menu bar.
  const tray = TrayIcon.getById(TRAY_ID);
  const sendToPopover = (board: Board) =>
    logFailure('send the Board to the popover', emitToWindow(POPOVER_WINDOW, 'menu-bar:board', board));

  const unsubscribe = subscribe((board) => {
    latest = board;
    // No number until a folder is picked: there is nothing to count yet.
    const title = hasScanRoot(board) ? String(countIn(board.projects, 'ready')) : null;
    logFailure('set the tray title', tray.then((icon) => icon?.setTitle(title)));
    sendToPopover(board);
  });
  const unlistens: Promise<UnlistenFn>[] = [
    listenFor('menu-bar:popover-ready', () => latest && sendToPopover(latest)),
    listenFor('menu-bar:reveal', (ticketId) => {
      showBoardWindow();
      onReveal(ticketId);
    }),
    listenFor('menu-bar:open-board', showBoardWindow),
  ];

  return () => {
    unsubscribe();
    for (const unlisten of unlistens) void unlisten.then((stop) => stop());
  };
}

function showBoardWindow() {
  const board = getCurrentWindow();
  logFailure(
    'bring the Board window forward',
    board
      .unminimize()
      .then(() => board.show())
      .then(() => board.setFocus()),
  );
}

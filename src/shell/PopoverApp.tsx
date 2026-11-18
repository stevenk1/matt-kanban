// The popover window's app: shows the latest Board the Board window sent as the Ready popover,
// sized to fit, and sends its clicks back to the Board window. "Settings…" opens the Settings
// window and "Open at login" goes to macOS directly. See menu-bar.ts. Checked by hand.
import { invoke } from '@tauri-apps/api/core';
import { LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Board } from '../board/board';
import { ReadyPopover } from '../ui/ReadyPopover';
import { logFailure } from './log-failure';
import { useOpenAtLogin } from './use-open-at-login';
import {
  BOARD_WINDOW,
  emitToWindow,
  listenFor,
  POPOVER_WIDTH,
  type WindowEvent,
  type WindowEvents,
} from './window-protocol';

/** The most of the screen's height the popover takes before it scrolls. */
const MAX_SCREEN_SHARE = 0.7;

export function PopoverApp() {
  const [board, setBoard] = useState<Board | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [openAtLogin, setOpenAtLogin] = useOpenAtLogin();

  useEffect(() => {
    const unlisten = listenFor('menu-bar:board', setBoard);
    void unlisten.then(() => emitToWindow(BOARD_WINDOW, 'menu-bar:popover-ready', null));
    return () => void unlisten.then((stop) => stop());
  }, []);

  useLayoutEffect(() => {
    const content = root.current?.firstElementChild;
    if (!content) return;
    const borders = content.getBoundingClientRect().height - content.clientHeight;
    const maxHeight = Math.round(window.screen.availHeight * MAX_SCREEN_SHARE);
    const height = Math.min(content.scrollHeight + borders, maxHeight);
    logFailure('size the popover', getCurrentWindow().setSize(new LogicalSize(POPOVER_WIDTH, height)));
  }, [board]);

  if (!board) return <p className="empty">Reading Projects…</p>;

  // Like a menu, the popover closes on whatever is clicked in it.
  const hide = () => logFailure('hide the popover', getCurrentWindow().hide());
  const sendToBoard = <E extends WindowEvent>(event: E, payload: WindowEvents[E]) => {
    hide();
    logFailure('reach the Board window', emitToWindow(BOARD_WINDOW, event, payload));
  };
  return (
    <div ref={root}>
      <ReadyPopover
        board={board}
        onReveal={(ticketId) => sendToBoard('menu-bar:reveal', ticketId)}
        onOpenBoard={() => sendToBoard('menu-bar:open-board', null)}
        onOpenSettings={() => {
          hide();
          // A command in src-tauri/src/settings.rs.
          logFailure('open Settings', invoke('open_settings'));
        }}
        openAtLogin={openAtLogin}
        onOpenAtLoginChange={(on) => {
          hide();
          setOpenAtLogin(on);
        }}
        // A command in src-tauri/src/menu_bar.rs.
        onQuit={() => logFailure('quit', invoke('quit_board'))}
      />
    </div>
  );
}

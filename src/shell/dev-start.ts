// BOARD_DEV_START's Board-window half: with `ticket:<id>`, the native shell
// (src-tauri/src/dev_start.rs, in a debug build only) names that Ticket once this window listens,
// and the view opens on it without bringing the window forward, so focus stays with the
// developer. Settings and the popover are opened by the native shell alone. Checked by hand
// (spec, "Thin Tauri shell").
import { emitToShell, listenFor } from './window-protocol';

/** Starts listening for the Ticket BOARD_DEV_START names, calling `onReveal` with its id. Returns the stop. */
export function startDevStart(onReveal: (ticketId: string) => void): () => void {
  const unlisten = listenFor('dev-start:reveal', onReveal);
  void unlisten.then(() => emitToShell('dev-start:ready', null));
  return () => void unlisten.then((stop) => stop());
}

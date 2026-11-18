// The app shell: keeps the Board current through the Tauri file-system and GitHub ports (see
// refresh.ts), reading the scan roots and leaving out the hidden Projects that Settings name, and
// hands it to the Board view with the Done window, and the opener that takes a Ticket to VS Code
// or GitHub. Every Board read is also published for the rest of the shell (board-events.ts),
// which the menu-bar extra (menu-bar.ts) and the Settings window (settings-window.ts) hear; a
// Ticket clicked in the popover (or named by BOARD_DEV_START, dev-start.ts) is revealed in the view,
// and changed Settings restart the reading.
// Checked by hand, not by automated tests (spec, "Thin Tauri shell").
import { useEffect, useState } from 'react';
import type { Board } from '../board/board';
import { readBoard } from '../board/read-board';
import { BoardView, type RevealRequest } from '../ui/BoardView';
import { publish } from './board-events';
import { startDevStart } from './dev-start';
import { startMenuBar } from './menu-bar';
import { startRefresh, type BoardState } from './refresh';
import { sendSavedSettings, startSettingsLink } from './settings-window';
import { listenForWindowFocus, tauriWatch } from './tauri-refresh';
import { tauriFileSystem } from './tauri-file-system';
import { tauriGitHub } from './tauri-github';
import { tauriOpener } from './tauri-opener';
import { messageOf } from '../board/errors';
import { withScanRoot, type Settings } from '../ui/settings';
import { loadSettings, pickScanRoot, saveSettings } from './tauri-settings';
import { watchSetOf } from './watch-set';
import './app.css';

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [state, setState] = useState<BoardState>({ board: null, readError: null, watchError: null });
  const [reveal, setReveal] = useState<RevealRequest>();
  const [addFolderError, setAddFolderError] = useState<string | null>(null);

  // Both started before the refresh below, so they hear the first Board read.
  const revealTicket = (ticketId: string) => setReveal({ ticketId });
  useEffect(() => startMenuBar(revealTicket), []);
  useEffect(() => startSettingsLink(setSettings), []);
  useEffect(() => startDevStart(revealTicket), []);

  useEffect(() => {
    // Loading the Settings also grants reading their scan roots, so it comes before any read.
    // Settings saved in the meantime are newer, so they win.
    void loadSettings().then((loaded) => setSettings((changed) => changed ?? loaded));
  }, []);

  // What the Board is read from: a new Board is read only when one of these changes.
  const readFrom = settings && JSON.stringify({ scanRoots: settings.scanRoots, hidden: settings.hiddenProjects });

  useEffect(() => {
    if (!readFrom) return;
    const { scanRoots, hidden }: { scanRoots: string[]; hidden: string[] } = JSON.parse(readFrom);
    let published: Board | null = null;
    return startRefresh({
      read: () => readBoard({ scanRoots, hiddenProjects: hidden, fs: tauriFileSystem, github: tauriGitHub }),
      watchSetOf: (board) => watchSetOf(scanRoots, board, tauriFileSystem),
      watch: tauriWatch,
      listenForFocus: listenForWindowFocus,
      onState: (next) => {
        // After Settings change, the Board read with the old ones shows until the new one is read.
        setState((shown) => ({ ...next, board: next.board ?? shown.board }));
        // Each Board read goes to the menu-bar extra and Settings too, once.
        if (next.board && next.board !== published) {
          published = next.board;
          publish(next.board);
        }
      },
      clock: window,
    });
  }, [readFrom]);

  // The empty state's Add Folder: the same pick and save as Settings' Add Folder, so the folder is
  // granted before the Board reads it. An open Settings window is told, so it doesn't save over it.
  const addFolder = async () => {
    if (!settings) return;
    const { folder, error } = await pickScanRoot();
    setAddFolderError(error);
    const next = folder ? withScanRoot(settings, folder) : settings;
    if (next === settings) return;
    try {
      await saveSettings(next);
      setSettings(next);
      sendSavedSettings(next);
    } catch (saveError) {
      setAddFolderError(`Couldn't save the Settings: ${messageOf(saveError)}`);
    }
  };

  const { board, readError, watchError } = state;
  if (!board) {
    return <p className="empty">{readError ?? 'Reading Projects…'}</p>;
  }
  return (
    <>
      <BoardView
        board={board}
        doneWindowDays={settings?.doneWindowDays}
        opener={tauriOpener}
        reveal={reveal}
        onRevealed={() => setReveal(undefined)}
        onAddFolder={() => void addFolder()}
      />
      {(readError || watchError || addFolderError) && (
        <div className="app-notes" role="status">
          {readError && (
            <p className="app-note" title={readError}>
              {readError}. Showing the Board read at {new Date(board.readAt).toLocaleTimeString()}.
            </p>
          )}
          {watchError && (
            <p className="app-note" title={watchError}>
              {watchError}
            </p>
          )}
          {addFolderError && (
            <p className="app-note" title={addFolderError}>
              {addFolderError}
            </p>
          )}
        </div>
      )}
    </>
  );
}

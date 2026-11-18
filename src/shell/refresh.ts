// Keeps the Board current (spec, Implementation Decisions "Refresh"): reads the whole Board at
// start, about 500 ms after the last of a burst of file-system changes, every 60 seconds (for
// GitHub Projects) and when the window gains focus. Reads never overlap: whatever asks for a
// read while one runs gets exactly one more read after it, and so does a read that adds folders
// to the watch, since a change in them during that read wasn't seen. The clock, the watcher, the
// window's focus and the read itself are passed in, so this is tested with fakes; the Tauri
// adapters that feed it in App.tsx are checked by hand.
import type { Board } from '../board/board';
import { messageOf } from '../board/errors';

/** The folders to watch: `recursive` ones for any change inside, `flat` ones for their own entries. */
export type WatchSet = { recursive: string[]; flat: string[] };

/**
 * What the window shows: the latest Board read (null until one succeeds), why the last read
 * failed, if it did (the Board read before it is kept), and why live updates are paused, if
 * watching what was read failed.
 */
export type BoardState = { board: Board | null; readError: string | null; watchError: string | null };

export type Clock = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'>;

export type RefreshOptions = {
  /** Reads the whole Board. */
  read: () => Promise<Board>;
  /** The folders whose changes can change this Board. */
  watchSetOf: (board: Board) => Promise<WatchSet>;
  /** Starts watching; `onChange` is called on any change. Resolves to a function that stops watching. */
  watch: (set: WatchSet, onChange: () => void) => Promise<() => void>;
  /** Calls `onFocus` whenever the window gains focus; returns a function that stops listening. */
  listenForFocus: (onFocus: () => void) => () => void;
  /** Called after every read attempt, and again when live updates pause or resume. */
  onState: (state: BoardState) => void;
  clock: Clock;
};

/** How long the file system must stay quiet before a change is read. */
const DEBOUNCE_MS = 500;
/** How often the whole Board is read anyway, so GitHub changes show. */
const INTERVAL_MS = 60_000;

/** Starts keeping the Board current; returns a function that stops it. */
export function startRefresh({ read, watchSetOf, watch, listenForFocus, onState, clock }: RefreshOptions): () => void {
  let stopped = false;
  let debounce: ReturnType<Clock['setTimeout']> | undefined;
  let reading = false;
  let readAgain = false;
  let state: BoardState = { board: null, readError: null, watchError: null };
  /** The watch in place, with its set as a string to compare the next set with, and its folders. */
  let liveWatch: { set: string; folders: Set<string>; unwatch: () => void } | null = null;

  const changed = () => {
    if (stopped) return;
    clock.clearTimeout(debounce);
    debounce = clock.setTimeout(readNow, DEBOUNCE_MS);
  };

  const report = (change: Partial<BoardState>) => {
    state = { ...state, ...change };
    onState(state);
  };

  /** Reads now, or once more after the read that is running. */
  async function readNow() {
    if (stopped) return;
    if (reading) {
      readAgain = true;
      return;
    }
    reading = true;
    try {
      await readAndWatch();
    } catch (error) {
      // Only `onState` can throw here; whatever it broke, the next read must still run.
      console.error("Couldn't show the Board just read:", error);
    } finally {
      reading = false;
    }
    if (readAgain) {
      readAgain = false;
      void readNow();
    }
  }

  async function readAndWatch() {
    let board;
    try {
      board = await read();
    } catch (error) {
      if (!stopped) report({ readError: `Couldn't read the Board: ${messageOf(error)}` });
      return;
    }
    if (stopped) return;
    report({ board, readError: null });
    let watchError: string | null = null;
    try {
      // A change made during the read, in a folder only this read found, wasn't watched yet.
      if (await watchWhatWasRead(board)) readAgain = true;
    } catch (error) {
      watchError = `Live updates paused: ${messageOf(error)}`;
    }
    // Reported only when it changes, so a failure that repeats on every read doesn't flicker.
    if (!stopped && watchError !== state.watchError) report({ watchError });
  }

  /**
   * Watches the folders `board` was read from, keeping the watch in place when they are the same.
   * True when the new watch adds folders an earlier watch didn't have; never for the first watch.
   */
  async function watchWhatWasRead(board: Board): Promise<boolean> {
    const set = await watchSetOf(board);
    const key = JSON.stringify(set);
    if (stopped || key === liveWatch?.set) return false;
    const unwatch = await watch(set, changed);
    if (stopped) {
      unwatch();
      return false;
    }
    const folders = new Set([...set.recursive, ...set.flat]);
    const added = liveWatch !== null && [...folders].some((folder) => !liveWatch!.folders.has(folder));
    // The new watch is in place before the old one goes, so no change is missed between them.
    liveWatch?.unwatch();
    liveWatch = { set: key, folders, unwatch };
    return added;
  }

  void readNow();
  const interval = clock.setInterval(readNow, INTERVAL_MS);
  const stopListening = listenForFocus(readNow);

  return () => {
    stopped = true;
    clock.clearTimeout(debounce);
    clock.clearInterval(interval);
    stopListening();
    liveWatch?.unwatch();
    liveWatch = null;
  };
}

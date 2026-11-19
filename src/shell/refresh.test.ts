import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '../board/board';
import { startRefresh, type BoardState, type WatchSet } from './refresh';

/** A Board told apart from the others by when it was read. */
function boardRead(at: number): Board {
  return { readAt: at, scanRoots: [], projects: [] };
}

/** The state after a successful read and watch. */
function current(board: Board): BoardState {
  return { board, readError: null, watchError: null };
}

/**
 * Starts the scheduler with fakes for its ports. Each read waits until the test settles it
 * with `finishRead` or `failRead`; `change()` is a file-system change and `focus()` the window
 * gaining focus. `states` collects what the scheduler reported; `onState` can be replaced.
 */
function start({ watchSetOf = (_board: Board): WatchSet => ({ recursive: ['/r'], flat: [] }) } = {}) {
  const reads: { resolve: (board: Board) => void; reject: (error: Error) => void }[] = [];
  const read = vi.fn(() => new Promise<Board>((resolve, reject) => reads.push({ resolve, reject })));
  let onChange = () => {};
  const unwatch = vi.fn<() => void>();
  const watch = vi.fn(async (_set: WatchSet, changed: () => void): Promise<() => void> => {
    onChange = changed;
    return unwatch;
  });
  let onFocus = () => {};
  const stopListening = vi.fn();
  const states: BoardState[] = [];
  const onState = vi.fn((state: BoardState) => {
    states.push(state);
  });
  const stop = startRefresh({
    read,
    watchSetOf: async (board) => watchSetOf(board),
    watch,
    listenForFocus: (focused) => {
      onFocus = focused;
      return stopListening;
    },
    onState,
    clock: globalThis,
  });

  /** Settles the oldest unsettled read with a Board read at `at`. */
  async function finishRead(at: number) {
    const next = reads.shift();
    if (!next) throw new Error('No read is running');
    next.resolve(boardRead(at));
    await vi.advanceTimersByTimeAsync(0);
  }
  async function failRead(message: string) {
    const next = reads.shift();
    if (!next) throw new Error('No read is running');
    next.reject(new Error(message));
    await vi.advanceTimersByTimeAsync(0);
  }

  return {
    read,
    watch,
    unwatch,
    stopListening,
    onState,
    states,
    stop,
    finishRead,
    failRead,
    change: () => onChange(),
    focus: () => onFocus(),
    elapse: (ms: number) => vi.advanceTimersByTimeAsync(ms),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startRefresh', () => {
  it('reads the Board at once and reports it', async () => {
    const scheduler = start();
    expect(scheduler.read).toHaveBeenCalledTimes(1);

    await scheduler.finishRead(1);

    expect(scheduler.states).toEqual([current(boardRead(1))]);
  });

  it('reads once, about 500 ms after the last of a burst of changes', async () => {
    const scheduler = start();
    await scheduler.finishRead(1);

    scheduler.change();
    await scheduler.elapse(300);
    scheduler.change();
    await scheduler.elapse(300);
    scheduler.change();
    await scheduler.elapse(499);
    expect(scheduler.read).toHaveBeenCalledTimes(1);

    await scheduler.elapse(1);
    expect(scheduler.read).toHaveBeenCalledTimes(2);
    await scheduler.finishRead(2);
    await scheduler.elapse(5_000);
    expect(scheduler.read).toHaveBeenCalledTimes(2);
    expect(scheduler.states.at(-1)).toEqual(current(boardRead(2)));
  });

  it('never overlaps reads: changes during a read give exactly one more read after it', async () => {
    const scheduler = start();
    await scheduler.finishRead(1);
    scheduler.change();
    await scheduler.elapse(500);
    expect(scheduler.read).toHaveBeenCalledTimes(2);

    scheduler.change();
    await scheduler.elapse(500);
    scheduler.change();
    await scheduler.elapse(500);
    expect(scheduler.read).toHaveBeenCalledTimes(2);

    await scheduler.finishRead(2);
    expect(scheduler.read).toHaveBeenCalledTimes(3);
    await scheduler.finishRead(3);
    await scheduler.elapse(5_000);
    expect(scheduler.read).toHaveBeenCalledTimes(3);
    expect(scheduler.states.map((s) => s.board?.readAt)).toEqual([1, 2, 3]);
  });

  it('reads again every 60 seconds, for GitHub', async () => {
    const scheduler = start();
    await scheduler.finishRead(1);

    await scheduler.elapse(59_999);
    expect(scheduler.read).toHaveBeenCalledTimes(1);
    await scheduler.elapse(1);
    expect(scheduler.read).toHaveBeenCalledTimes(2);
    await scheduler.finishRead(2);
    await scheduler.elapse(60_000);
    expect(scheduler.read).toHaveBeenCalledTimes(3);
  });

  it('reads again at once when the window gains focus', async () => {
    const scheduler = start();
    await scheduler.finishRead(1);

    scheduler.focus();

    expect(scheduler.read).toHaveBeenCalledTimes(2);
  });

  it('keeps the last Board when a read fails, with the error, until a read succeeds', async () => {
    const scheduler = start();
    await scheduler.finishRead(1);

    scheduler.focus();
    await scheduler.failRead('gh timed out');
    expect(scheduler.states.at(-1)).toEqual({
      board: boardRead(1),
      readError: "MattBoard couldn't read your Projects: gh timed out",
      watchError: null,
    });

    scheduler.change();
    await scheduler.elapse(500);
    await scheduler.finishRead(2);
    expect(scheduler.states.at(-1)).toEqual(current(boardRead(2)));
  });

  it('reports a failed first read with no Board, and keeps trying', async () => {
    const scheduler = start();
    await scheduler.failRead('no scan root');
    expect(scheduler.states).toEqual([
      { board: null, readError: "MattBoard couldn't read your Projects: no scan root", watchError: null },
    ]);

    await scheduler.elapse(60_000);
    await scheduler.finishRead(1);
    expect(scheduler.states.at(-1)).toEqual(current(boardRead(1)));
  });

  it('keeps reading when reporting a state throws', async () => {
    const scheduler = start();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    scheduler.onState.mockImplementationOnce(() => {
      throw new Error('a subscriber broke');
    });
    await scheduler.finishRead(1);

    scheduler.focus();
    expect(scheduler.read).toHaveBeenCalledTimes(2);
    await scheduler.finishRead(2);
    expect(scheduler.states.at(-1)).toEqual(current(boardRead(2)));
  });

  it('watches what each read found, swapping the watch only when that changes', async () => {
    // Boards read at 1 and 2 have the same folders; the one read at 3 has a new worktree.
    const scheduler = start({
      watchSetOf: (board) => ({ recursive: board.readAt < 3 ? ['/p/.scratch'] : ['/p/.scratch', '/p/wt/.scratch'], flat: ['/p'] }),
    });
    await scheduler.finishRead(1);
    expect(scheduler.watch).toHaveBeenCalledExactlyOnceWith({ recursive: ['/p/.scratch'], flat: ['/p'] }, expect.any(Function));

    scheduler.focus();
    await scheduler.finishRead(2);
    expect(scheduler.watch).toHaveBeenCalledTimes(1);
    expect(scheduler.unwatch).not.toHaveBeenCalled();

    scheduler.focus();
    await scheduler.finishRead(3);
    expect(scheduler.watch).toHaveBeenCalledTimes(2);
    expect(scheduler.watch).toHaveBeenLastCalledWith(
      { recursive: ['/p/.scratch', '/p/wt/.scratch'], flat: ['/p'] },
      expect.any(Function),
    );
    expect(scheduler.unwatch).toHaveBeenCalledTimes(1);
  });

  it('reads once more when a read adds folders to the watch, so a change made during that read is not lost', async () => {
    // The Board read at 2 has a new worktree; its .scratch/ may have changed while it was read.
    const scheduler = start({
      watchSetOf: (board) => ({ recursive: board.readAt < 2 ? ['/p/.scratch'] : ['/p/.scratch', '/p/wt/.scratch'], flat: [] }),
    });
    await scheduler.finishRead(1);
    expect(scheduler.read).toHaveBeenCalledTimes(1);

    scheduler.focus();
    await scheduler.finishRead(2);
    expect(scheduler.read).toHaveBeenCalledTimes(3);

    await scheduler.finishRead(3);
    await scheduler.elapse(5_000);
    expect(scheduler.read).toHaveBeenCalledTimes(3);
    expect(scheduler.states.at(-1)).toEqual(current(boardRead(3)));
  });

  it('does not read again when a read only drops folders from the watch', async () => {
    // The worktree read at 1 is gone by the read at 2.
    const scheduler = start({
      watchSetOf: (board) => ({ recursive: board.readAt < 2 ? ['/p/.scratch', '/p/wt/.scratch'] : ['/p/.scratch'], flat: [] }),
    });
    await scheduler.finishRead(1);

    scheduler.focus();
    await scheduler.finishRead(2);
    await scheduler.elapse(5_000);

    expect(scheduler.watch).toHaveBeenCalledTimes(2);
    expect(scheduler.read).toHaveBeenCalledTimes(2);
  });

  it('says live updates are paused while watching fails, without clearing it in between, and keeps the earlier watch', async () => {
    // Every read finds other folders, so each one tries a new watch.
    const scheduler = start({ watchSetOf: (board) => ({ recursive: [`/r/${board.readAt}`], flat: [] }) });
    await scheduler.finishRead(1);
    scheduler.watch.mockRejectedValueOnce(new Error('path not found'));
    scheduler.watch.mockRejectedValueOnce(new Error('path not found'));
    const paused = 'Live updates paused: path not found';

    scheduler.focus();
    await scheduler.finishRead(2);
    expect(scheduler.states.at(-1)).toEqual({ board: boardRead(2), readError: null, watchError: paused });
    const failedAt = scheduler.states.length;

    scheduler.focus();
    await scheduler.finishRead(3);
    expect(scheduler.states.slice(failedAt).map((s) => s.watchError)).toEqual([paused]);
    expect(scheduler.states.at(-1)).toEqual({ board: boardRead(3), readError: null, watchError: paused });
    expect(scheduler.unwatch).not.toHaveBeenCalled();

    scheduler.focus();
    await scheduler.finishRead(4);
    expect(scheduler.states.at(-1)).toEqual(current(boardRead(4)));
  });

  it('once stopped, stops watching and listening, and reports nothing more', async () => {
    const scheduler = start();
    await scheduler.finishRead(1);
    scheduler.focus();

    scheduler.stop();
    expect(scheduler.unwatch).toHaveBeenCalledTimes(1);
    expect(scheduler.stopListening).toHaveBeenCalledTimes(1);
    await scheduler.finishRead(2);
    scheduler.change();
    await scheduler.elapse(120_000);

    expect(scheduler.read).toHaveBeenCalledTimes(2);
    expect(scheduler.states).toHaveLength(1);
  });

  it('stops a watch that was still being set up when it was stopped', async () => {
    const scheduler = start();
    let finishWatch = (_unwatch: () => void) => {};
    scheduler.watch.mockImplementationOnce(() => new Promise((resolve) => (finishWatch = resolve)));
    await scheduler.finishRead(1);

    scheduler.stop();
    const lateUnwatch = vi.fn();
    finishWatch(lateUnwatch);
    await scheduler.elapse(0);

    expect(lateUnwatch).toHaveBeenCalledTimes(1);
  });
});

// The shell's "a Board was read" event. App.tsx publishes every Board it reads successfully;
// whatever else shows the Board (the menu-bar extra) subscribes, so it stays as current as the
// window.
import type { Board } from '../board/board';

type Listener = (board: Board) => void;

const listeners = new Set<Listener>();

/** Calls `listener` with every Board read from now on; returns a function that unsubscribes. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hands a freshly read Board to every subscriber; one that throws is logged and doesn't stop the rest. */
export function publish(board: Board): void {
  for (const listener of listeners) {
    try {
      listener(board);
    } catch (error) {
      console.error('A Board subscriber failed:', error);
    }
  }
}

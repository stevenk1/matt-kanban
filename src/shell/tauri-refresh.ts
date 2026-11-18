// The Tauri implementations of the refresh scheduler's watcher and window-focus ports. Watching
// goes through the fs plugin (its `watch` Cargo feature, and `fs:allow-watch` within the read
// scope in src-tauri/capabilities/default.json). Checked by hand, not by automated tests.
import { getCurrentWindow } from '@tauri-apps/api/window';
import { watchImmediate, type UnwatchFn, type WatchEvent } from '@tauri-apps/plugin-fs';
import type { WatchSet } from './refresh';

/**
 * Watches `set`, reporting every change at once; the scheduler does the debouncing. The
 * recursive folders and the flat ones each get one watcher. Either all of them start or none
 * stays running.
 */
export async function tauriWatch(set: WatchSet, onChange: () => void): Promise<() => void> {
  // Reading a file is not a change. macOS doesn't report reads, but other platforms would, and
  // the Board's own reads would then trigger reads forever.
  const onEvent = (event: WatchEvent) => {
    if (typeof event.type === 'object' && 'access' in event.type) return;
    onChange();
  };
  const unwatches: UnwatchFn[] = [];
  const unwatchAll = () => unwatches.forEach((unwatch) => unwatch());
  try {
    if (set.recursive.length > 0) unwatches.push(...(await watchAllThatStart(set.recursive, onEvent, true)));
    if (set.flat.length > 0) unwatches.push(...(await watchAllThatStart(set.flat, onEvent, false)));
  } catch (error) {
    unwatchAll();
    throw error;
  }
  return unwatchAll;
}

/**
 * One watcher for all of `paths`. The plugin refuses the lot when one path is gone (it can vanish
 * after the watch set was made), so then each path gets its own watcher and those that fail are
 * left out. Fails only when none of them start.
 */
async function watchAllThatStart(
  paths: string[],
  onEvent: (event: WatchEvent) => void,
  recursive: boolean,
): Promise<UnwatchFn[]> {
  try {
    return [await watchImmediate(paths, onEvent, { recursive })];
  } catch (error) {
    const attempts = await Promise.allSettled(paths.map((path) => watchImmediate(path, onEvent, { recursive })));
    const unwatches: UnwatchFn[] = [];
    attempts.forEach((attempt, i) => {
      if (attempt.status === 'fulfilled') unwatches.push(attempt.value);
      else console.warn(`Not watching ${paths[i]}:`, attempt.reason);
    });
    if (unwatches.length === 0) throw error;
    return unwatches;
  }
}

/** Calls `onFocus` whenever the Board window gains focus; returns a function that stops listening. */
export function listenForWindowFocus(onFocus: () => void): () => void {
  const listening = getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) onFocus();
  });
  return () => {
    void listening.then((stopListening) => stopListening());
  };
}

// The Board's Settings (spec, Implementation Decisions "Settings"): the scan roots, the hidden
// Projects and the Done window. Open at login isn't kept here: the login item itself is the
// truth, asked of macOS through the autostart plugin. The shell saves these as JSON in the app's
// config directory; this module turns whatever it finds there back into Settings.
import { withoutTrailingSlash } from '../board/file-system';

export type Settings = {
  /** Absolute folders whose direct children may be Projects; none until the user picks one. */
  scanRoots: string[];
  /** The folders of Projects left off the Board. */
  hiddenProjects: string[];
  /** How many days a Done Ticket stays in the mini-board's Done column. */
  doneWindowDays: number;
};

/** A Project as Settings names it: by its folder, which tells apart same-named Projects. */
export type ProjectRef = { name: string; dir: string };

export const DEFAULT_DONE_WINDOW_DAYS = 14;
/** The Done window's bounds, in days. */
export const MIN_DONE_WINDOW_DAYS = 1;
export const MAX_DONE_WINDOW_DAYS = 365;

/** Whether `days` can be the Done window. */
export function isDoneWindow(days: number): boolean {
  return Number.isInteger(days) && days >= MIN_DONE_WINDOW_DAYS && days <= MAX_DONE_WINDOW_DAYS;
}

/**
 * The Settings in a saved file's text (null when there is none), each setting checked on its
 * own: one that is missing or unusable gets its default, the others are kept. There is no
 * default scan root: the user picks each one.
 */
export function settingsFromFile(text: string | null): Settings {
  const saved = parsedObject(text);
  return {
    scanRoots: folders(saved.scanRoots),
    hiddenProjects: folders(saved.hiddenProjects),
    doneWindowDays:
      typeof saved.doneWindowDays === 'number' && isDoneWindow(saved.doneWindowDays)
        ? saved.doneWindowDays
        : DEFAULT_DONE_WINDOW_DAYS,
  };
}

/** `settings` with `folder` added as the last scan root; the same Settings when it already is one. */
export function withScanRoot(settings: Settings, folder: string): Settings {
  return settings.scanRoots.includes(folder) ? settings : { ...settings, scanRoots: [...settings.scanRoots, folder] };
}

function parsedObject(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The absolute folder paths in `value`, without trailing slashes or repeats. */
function folders(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const paths = value
    .filter((path): path is string => typeof path === 'string' && path.startsWith('/'))
    .map(withoutTrailingSlash);
  return [...new Set(paths)];
}

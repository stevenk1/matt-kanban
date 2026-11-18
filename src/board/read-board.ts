// The Board reader (seam 1): turns the scan roots into a complete Board value.
// Callers never parse a file; everything about disk layout lives behind this entry point.
// It never throws for one unreadable source: that source becomes an error on the Board.
import type { Board, Project, Tracker } from './board';
import { readCheckouts } from './checkouts';
import { messageOf } from './errors';
import { folderName, joinPath, withoutTrailingSlash, type FileSystem } from './file-system';
import type { GitHub } from './github';
import { githubFeaturesIn } from './read-github';

export type ReadBoardOptions = {
  /** Absolute folders whose direct children may be Projects. */
  scanRoots: string[];
  /** Folders of Projects to leave out (hidden in Settings): they aren't read and aren't on the Board. */
  hiddenProjects?: string[];
  fs: FileSystem;
  /** Reads GitHub Projects' issues; without it, a GitHub Project shows only its local Features. */
  github?: GitHub;
};

const TRACKER_FILE = 'docs/agents/issue-tracker.md';

export async function readBoard({ scanRoots, hiddenProjects = [], fs, github }: ReadBoardOptions): Promise<Board> {
  const hidden = new Set(hiddenProjects.map(withoutTrailingSlash));
  const projects: Project[] = [];
  for (const scanRoot of scanRoots) {
    projects.push(...(await projectsUnder(scanRoot, scanRoots, hidden, fs, github)));
  }
  return { readAt: Date.now(), scanRoots, projects };
}

/**
 * The Projects among a scan root's direct children. A missing scan root has none; one
 * that exists but can't be listed comes back as a single entry carrying the error, so it
 * shows on the Board instead of silently showing nothing.
 */
async function projectsUnder(
  scanRoot: string,
  /** Every scan root: a worktree is read only when it's inside one. */
  scanRoots: string[],
  hidden: Set<string>,
  fs: FileSystem,
  github?: GitHub,
): Promise<Project[]> {
  let names: string[];
  try {
    if (!(await fs.exists(scanRoot))) return [];
    names = await fs.listDir(scanRoot);
  } catch (error) {
    return [unreadable(scanRoot, `Couldn't read the scan root: ${messageOf(error)}`)];
  }

  const projects: Project[] = [];
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    const dir = joinPath(scanRoot, name);
    if (hidden.has(dir)) continue;
    const project = await projectAt(dir, scanRoots, fs, github);
    if (project) projects.push(project);
  }
  return projects;
}

/** The Project in `dir`, or null when `dir` has no issue tracker and so isn't one. */
async function projectAt(
  dir: string,
  scanRoots: string[],
  fs: FileSystem,
  github?: GitHub,
): Promise<Project | null> {
  const trackerFile = joinPath(dir, TRACKER_FILE);
  try {
    if (!(await fs.exists(trackerFile))) return null;
    const tracker = trackerOf(await fs.readText(trackerFile));
    const name = folderName(dir);
    // Local data from the main checkout and its worktrees, then GitHub's.
    const { features, stories, error: localError } = await readCheckouts(dir, name, scanRoots, fs);
    const fromGitHub = tracker === 'github' && github ? await githubFeaturesIn(dir, name, github) : { features: [] };
    // Each reader can fail on its own; show every message, not just the last.
    const error = [localError, fromGitHub.error].filter(Boolean).join('; ');
    return { name, dir, tracker, ...(error && { error }), features: [...features, ...fromGitHub.features], stories };
  } catch (error) {
    return unreadable(dir, `Couldn't read ${TRACKER_FILE}: ${messageOf(error)}`);
  }
}

/** GitHub when the tracker file's first line mentions GitHub, local otherwise. */
function trackerOf(trackerFileText: string): Tracker {
  const firstLine = trackerFileText.split('\n', 1)[0];
  return /github/i.test(firstLine) ? 'github' : 'local';
}

function unreadable(dir: string, error: string): Project {
  return { name: folderName(dir), dir, tracker: 'local', error, features: [], stories: [] };
}

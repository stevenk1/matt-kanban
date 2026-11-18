// A Project's checkouts: its main checkout and the git worktrees recorded in its
// `.git/worktrees/` that have a `.scratch/` folder. Part of the Board reader (seam 1); tested
// through `readBoard`. `findCheckouts` is also used by the shell, to watch the same checkouts
// the reader reads.
import type { Feature, Story } from './board';
import { messageOf } from './errors';
import { folderName, isInside, joinPath, parentOf, resolvePath, type FileSystem } from './file-system';
import { featuresIn } from './read-features';
import { isDoneStory, storiesIn } from './read-stories';

/** Where git records a Project's worktrees: one folder per worktree, each with a `gitdir` file. */
export const GIT_WORKTREES_DIR = '.git/worktrees';

export type Checkout = {
  dir: string;
  /** The worktree's folder name; null for the main checkout. */
  worktree: string | null;
};

export type CheckoutContents = {
  features: Feature[];
  /** The Stories that aren't done. */
  stories: Story[];
  /** Every message from every checkout; what could be read is still returned. */
  error?: string;
};

/**
 * The Features and Stories of every checkout of the Project in `projectDir`, one copy of
 * each by slug: the main checkout's copy wins, then the first worktree's by path. A copy
 * from a worktree carries the worktree's name. A Story is left out when its chosen copy
 * is done, so a Story done in the main checkout hides a stale worktree's copy. Never throws.
 */
export async function readCheckouts(
  projectDir: string,
  projectName: string,
  scanRoots: string[],
  fs: FileSystem,
): Promise<CheckoutContents> {
  const features = new Map<string, Feature>();
  const stories = new Map<string, Story>();
  const found = await findCheckouts(projectDir, scanRoots, fs);
  const readErrors: string[] = [];
  for (const { dir, worktree } of found.checkouts) {
    const featureContents = await featuresIn(dir, projectName, fs);
    const storyContents = await storiesIn(dir, fs);
    addFirstCopies(features, featureContents.features, worktree);
    addFirstCopies(stories, storyContents.stories, worktree);
    for (const error of [featureContents.error, storyContents.error]) {
      if (error) readErrors.push(worktree === null ? error : `In worktree ${worktree}: ${error}`);
    }
  }
  const error = [...found.errors, ...readErrors].join('; ');
  return {
    features: [...features.values()],
    stories: [...stories.values()].filter((story) => !isDoneStory(story)),
    ...(error && { error }),
  };
}

/** Adds each item whose slug isn't in `bySlug` yet, marked with the worktree it came from. */
function addFirstCopies<T extends { slug: string; worktree: string | null }>(
  bySlug: Map<string, T>,
  items: T[],
  worktree: string | null,
) {
  for (const item of items) {
    if (!bySlug.has(item.slug)) bySlug.set(item.slug, { ...item, worktree });
  }
}

export type FoundCheckouts = {
  checkouts: Checkout[];
  /**
   * Every worktree folder git records that is inside a scan root, by path, whether or not it
   * still exists or has a `.scratch/` yet. The shell watches these, so a `.scratch/` that
   * arrives after the checkout shows.
   */
  worktreeDirs: string[];
  /** One message per file-system call that failed while looking. */
  errors: string[];
};

/**
 * The main checkout, then each worktree git records in `.git/worktrees/<entry>/gitdir`, by
 * path. A `gitdir` file holds the path of the worktree's `.git` file (relative to the entry's
 * folder when git is set to write relative paths), so the worktree is that file's folder. A
 * worktree is a checkout when its folder is inside a scan root, still exists and has a
 * `.scratch/` folder; otherwise it's skipped without a message. The scan-root check comes
 * first, so nothing outside the scan roots is touched (the app's file system would refuse it).
 * A Project whose `.git` is missing or a file has no worktrees. Never throws: a file-system
 * call that fails is named in `errors`, by its path in the Project or by the worktree's name,
 * and only what it was looking at is skipped.
 */
export async function findCheckouts(projectDir: string, scanRoots: string[], fs: FileSystem): Promise<FoundCheckouts> {
  const errors: string[] = [];
  const at = (path: string) => joinPath(projectDir, path);

  /** Runs `look`; when it fails, records `failure` with the reason and answers `otherwise`. */
  const tryOrRecord = async <T>(failure: string, otherwise: T, look: () => Promise<T>): Promise<T> => {
    try {
      return await look();
    } catch (error) {
      errors.push(`${failure}: ${messageOf(error)}`);
      return otherwise;
    }
  };

  /** The text of the file at `path` in the Project, trimmed; empty when there's no such file. */
  const textOrRecord = (path: string) =>
    tryOrRecord(`Couldn't read ${path}`, '', async () =>
      (await fs.exists(at(path))) ? (await fs.readText(at(path))).trim() : '',
    );

  // `.git/worktrees` doesn't exist when `.git` is missing or a file.
  const worktreeEntries = await tryOrRecord(`Couldn't read ${GIT_WORKTREES_DIR}`, [], async () =>
    (await fs.exists(at(GIT_WORKTREES_DIR))) ? fs.listDir(at(GIT_WORKTREES_DIR)) : [],
  );
  const worktreeDirs: string[] = [];
  for (const entry of worktreeEntries) {
    const entryDir = joinPath(GIT_WORKTREES_DIR, entry);
    const gitFilePath = await textOrRecord(joinPath(entryDir, 'gitdir'));
    if (!gitFilePath) continue;
    const dir = parentOf(resolvePath(at(entryDir), gitFilePath));
    if (scanRoots.some((scanRoot) => isInside(dir, scanRoot))) worktreeDirs.push(dir);
  }
  worktreeDirs.sort((a, b) => a.localeCompare(b));

  const checkouts: Checkout[] = [{ dir: projectDir, worktree: null }];
  for (const dir of worktreeDirs) {
    const worktree = folderName(dir);
    // A worktree whose folder is gone has no `.scratch/` either.
    const hasScratch = await tryOrRecord(`In worktree ${worktree}: Couldn't read .scratch`, false, () =>
      fs.exists(joinPath(dir, '.scratch')),
    );
    if (hasScratch) checkouts.push({ dir, worktree });
  }
  return { checkouts, worktreeDirs, errors };
}

// The folders the shell watches for a Board (spec, "Refresh"): the `.scratch/` folder of every
// checkout the Board reader reads (src/board/checkouts.ts), recursively, plus the folders where a
// new Project, worktree or `.scratch/` folder would appear, for their own entries only. A folder
// that has vanished, or can't be looked at, is left out rather than failing the whole set.
// Checked by hand with the rest of the shell.
import type { Board } from '../board/board';
import { findCheckouts, GIT_WORKTREES_DIR } from '../board/checkouts';
import { joinPath, parentOf, type FileSystem } from '../board/file-system';
import type { WatchSet } from './refresh';

export async function watchSetOf(scanRoots: string[], board: Board, fs: FileSystem): Promise<WatchSet> {
  const recursive = new Set<string>();
  const flat = new Set<string>();
  const isThere = (path: string) => fs.exists(path).catch(() => false);
  const watchIfThere = async (path: string, into: Set<string>) => {
    if (await isThere(path)) into.add(path);
  };

  // A new Project appears as a new folder in a scan root.
  for (const scanRoot of scanRoots) await watchIfThere(scanRoot, flat);

  for (const project of board.projects) {
    // The Project's own entries show its `.scratch/` folder appearing.
    await watchIfThere(project.dir, flat);
    // Git's worktree list shows a worktree being added anywhere. Until the first one, git's
    // folder shows the list appearing (only when `.git` is a folder; a file has no list).
    const gitWorktrees = joinPath(project.dir, GIT_WORKTREES_DIR);
    const gitDir = joinPath(project.dir, '.git');
    if (await isThere(gitWorktrees)) flat.add(gitWorktrees);
    else if (await fs.stat(gitDir).then((s) => s.isDirectory, () => false)) flat.add(gitDir);

    const { checkouts, worktreeDirs } = await findCheckouts(project.dir, scanRoots, fs);
    for (const checkout of checkouts) await watchIfThere(joinPath(checkout.dir, '.scratch'), recursive);
    for (const dir of worktreeDirs) {
      // A worktree's own entries show its `.scratch/` arriving after the checkout; its parent
      // folder shows another worktree appearing beside it.
      await watchIfThere(dir, flat);
      await watchIfThere(parentOf(dir), flat);
    }
  }
  return { recursive: [...recursive], flat: [...flat] };
}

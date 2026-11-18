// Shared fixtures for the Board reader's tests: real temporary folder trees, read through
// the Node file-system port, and the tracker files that make a folder a Project.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { FileSystem } from './file-system';
import { nodeFileSystem } from './node-file-system';

/** A `docs/agents/issue-tracker.md` for a Project whose Tickets live in `.scratch/`. */
export const LOCAL_TRACKER = '# Issue tracker: Local Markdown\n\nIssues live in `.scratch/`.\n';

/** A `docs/agents/issue-tracker.md` for a Project whose Tickets are GitHub issues. */
export const GITHUB_TRACKER = '# Issue tracker: GitHub\n\nIssues live in GitHub Issues.\n';

/** A new empty folder under the system's temp folder, named from `prefix`. */
export function makeTempRoot(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Deletes a folder made by `makeTempRoot`, and everything in it. */
export function removeTempRoot(root: string): Promise<void> {
  return rm(root, { recursive: true, force: true });
}

/** Writes files under `base`, creating folders as needed. */
export async function tree(base: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    const full = join(base, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

/**
 * The files `git worktree add` makes for a worktree of the Project in `projectDir`: the
 * worktree's `.git` file, and the Project's `.git/worktrees/<name>/gitdir` pointing back to it.
 * `worktreePath` is relative to `projectDir` (`../alpha-worktrees/x` for a sibling folder), and
 * so are the returned paths; `name` is the worktree's folder name, as git names it.
 */
export function gitWorktree(projectDir: string, worktreePath: string): Record<string, string> {
  const worktreeDir = resolve(projectDir, worktreePath);
  const name = basename(worktreeDir);
  return {
    [`${worktreePath}/.git`]: `gitdir: ${join(projectDir, '.git/worktrees', name)}\n`,
    [`.git/worktrees/${name}/gitdir`]: `${join(worktreeDir, '.git')}\n`,
  };
}

/**
 * The Node file system, except that every call on a path `refuses` picks fails with
 * "forbidden path", the way the app's file system refuses a path outside its scope.
 */
export function refusingFileSystem(refuses: (path: string) => boolean): FileSystem {
  const guard =
    <T>(call: (path: string) => Promise<T>) =>
    (path: string): Promise<T> =>
      refuses(path) ? Promise.reject(new Error('forbidden path')) : call(path);
  return {
    listDir: guard(nodeFileSystem.listDir),
    readText: guard(nodeFileSystem.readText),
    stat: guard(nodeFileSystem.stat),
    exists: guard(nodeFileSystem.exists),
  };
}

// Seam 1, the Board reader: Features and Stories in a Project's worktrees, found from `.git/worktrees/`.
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Project } from './board';
import { isInside, type FileSystem } from './file-system';
import { nodeFileSystem } from './node-file-system';
import { readBoard } from './read-board';
import {
  gitWorktree,
  LOCAL_TRACKER,
  makeTempRoot,
  refusingFileSystem,
  removeTempRoot,
  tree,
} from './reader-fixtures';

let root: string;

beforeEach(async () => {
  root = await makeTempRoot('board-checkouts-');
});

afterEach(() => removeTempRoot(root));

/** A Project `alpha` under the scan root with the given files, paths relative to its folder. */
async function alpha(files: Record<string, string>, fs: FileSystem = nodeFileSystem): Promise<Project> {
  await tree(join(root, 'alpha'), { 'docs/agents/issue-tracker.md': LOCAL_TRACKER, ...files });
  const board = await readBoard({ scanRoots: [root], fs });
  return board.projects[0];
}

/** A worktree of `alpha` at `path` (relative to alpha's folder), registered as git does. */
function checkout(path: string): Record<string, string> {
  return gitWorktree(join(root, 'alpha'), path);
}

function ticket(title: string, status: string, blockedBy = 'None'): string {
  return `# ${title}\n\n**Blocked by:** ${blockedBy}\n\n**Status:** ${status}\n`;
}

describe('readBoard: worktree Features', () => {
  it('reads a Feature in a worktree in a sibling folder, naming the worktree by its folder', async () => {
    const project = await alpha({
      '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
      ...checkout('../alpha-worktrees/1042'),
      '../alpha-worktrees/1042/.scratch/avoidable/spec.md': '# Spec: Avoidable breaking changes\n',
      '../alpha-worktrees/1042/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'ready-for-agent'),
    });

    expect(project.error).toBeUndefined();
    expect(project.features.map((f) => [f.slug, f.title, f.worktree])).toEqual([
      ['board', 'board', null],
      ['avoidable', 'Avoidable breaking changes', '1042'],
    ]);
    expect(project.features[1].tickets[0].location).toEqual({
      kind: 'file',
      path: join(root, 'alpha-worktrees/1042/.scratch/avoidable/issues/01-audit.md'),
    });
  });

  it('reads a worktree whose gitdir git wrote as a relative path', async () => {
    const project = await alpha({
      // With `worktree.useRelativePaths`, the path is relative to the `.git/worktrees/<name>/` folder.
      '.git/worktrees/rel/gitdir': '../../../../alpha-worktrees/rel/.git\n',
      '../alpha-worktrees/rel/.git': 'gitdir: ../../alpha/.git/worktrees/rel\n',
      '../alpha-worktrees/rel/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'done'),
    });

    expect(project.error).toBeUndefined();
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([['avoidable', 'rel']]);
  });

  it('skips, with no error, a worktree outside every scan root, one whose folder is gone, and one with no .scratch', async () => {
    const elsewhere = await makeTempRoot('board-elsewhere-');
    // Like the app's file system, which refuses any path outside its scope.
    const inScope = refusingFileSystem((path) => path !== root && !isInside(path, root));
    try {
      await tree(elsewhere, {
        'outside/.git': `gitdir: ${join(root, 'alpha/.git/worktrees/outside')}\n`,
        'outside/.scratch/far/issues/01-far.md': ticket('01: Far', 'done'),
      });
      const project = await alpha(
        {
          '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
          '.git/worktrees/outside/gitdir': `${join(elsewhere, 'outside/.git')}\n`,
          // Registered, but its folder has been deleted since (a prunable worktree).
          '.git/worktrees/gone/gitdir': `${join(root, 'alpha-worktrees/gone/.git')}\n`,
          ...checkout('../alpha-worktrees/code-only'),
          '../alpha-worktrees/code-only/README.md': '# A checkout\n',
        },
        inScope,
      );

      expect(project.error).toBeUndefined();
      expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([['board', null]]);
    } finally {
      await removeTempRoot(elsewhere);
    }
  });

  it("shows a Feature in the main checkout and a sibling-folder worktree once, from the main checkout, alongside a .claude/worktrees worktree's", async () => {
    const project = await alpha({
      '.scratch/board/issues/01-shell.md': ticket('01: Shell, main copy', 'done'),
      ...checkout('../alpha-worktrees/1042'),
      '../alpha-worktrees/1042/.scratch/board/issues/01-shell.md': ticket('01: Shell, worktree copy', 'done'),
      ...checkout('.claude/worktrees/review'),
      '.claude/worktrees/review/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'done'),
    });

    expect(project.error).toBeUndefined();
    expect(project.features.map((f) => [f.slug, f.worktree, f.tickets[0].title])).toEqual([
      ['board', null, 'Shell, main copy'],
      ['avoidable', 'review', 'Audit'],
    ]);
  });

  it('reads no worktrees, and notes nothing, for a Project whose .git is a file', async () => {
    const project = await alpha({
      '.git': `gitdir: ${join(root, 'other/.git/worktrees/alpha')}\n`,
      '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
    });

    expect(project.error).toBeUndefined();
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([['board', null]]);
  });

  it('reads a Feature that exists only in a worktree, naming the worktree', async () => {
    const project = await alpha({
      '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
      ...checkout('.claude/worktrees/review-2ec62d'),
      '.claude/worktrees/review-2ec62d/.scratch/avoidable/spec.md': '# Spec: Avoidable breaking changes\n',
      '.claude/worktrees/review-2ec62d/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'ready-for-agent'),
    });

    expect(project.error).toBeUndefined();
    expect(project.features.map((f) => [f.slug, f.title, f.worktree])).toEqual([
      ['board', 'board', null],
      ['avoidable', 'Avoidable breaking changes', 'review-2ec62d'],
    ]);
    const avoidable = project.features[1];
    expect(avoidable.tickets.map((t) => [t.num, t.title, t.state])).toEqual([['01', 'Audit', 'ready']]);
    expect(avoidable.tickets[0].location).toEqual({
      kind: 'file',
      path: join(root, 'alpha/.claude/worktrees/review-2ec62d/.scratch/avoidable/issues/01-audit.md'),
    });
  });

  it('shows a Feature in both the main checkout and a worktree once, from the main checkout, with blockers from that copy only', async () => {
    const project = await alpha({
      '.scratch/board/spec.md': '# Spec: The Board\n',
      '.scratch/board/issues/02-list.md': ticket('02: List', 'ready-for-agent', '01'),
      ...checkout('.claude/worktrees/feature-x'),
      '.claude/worktrees/feature-x/.scratch/board/spec.md': '# Spec: The Board, an older draft\n',
      '.claude/worktrees/feature-x/.scratch/board/issues/01-shell.md': ticket('01: Shell', 'ready-for-agent'),
      '.claude/worktrees/feature-x/.scratch/board/issues/02-list.md': ticket('02: List', 'ready-for-agent', '01'),
    });

    expect(project.features).toHaveLength(1);
    const [board] = project.features;
    expect([board.title, board.worktree]).toEqual(['The Board', null]);
    // 01 exists only in the worktree's copy, so it neither appears nor blocks 02.
    expect(board.tickets.map((t) => [t.num, t.state, t.openBlockers, t.blockerNote])).toEqual([
      ['02', 'ready', [], '01'],
    ]);
    expect(board.tickets[0].location).toEqual({ kind: 'file', path: join(root, 'alpha/.scratch/board/issues/02-list.md') });
  });

  it('shows a Feature in two worktrees once, from the first worktree by path', async () => {
    const project = await alpha({
      ...checkout('.claude/worktrees/zeta'),
      '.claude/worktrees/zeta/.scratch/board/issues/01-shell.md': ticket('01: Shell from zeta', 'done'),
      ...checkout('.claude/worktrees/beta'),
      '.claude/worktrees/beta/.scratch/board/issues/01-shell.md': ticket('01: Shell from beta', 'done'),
    });

    expect(project.features.map((f) => [f.slug, f.worktree, f.tickets[0].title])).toEqual([
      ['board', 'beta', 'Shell from beta'],
    ]);
  });

  it('finds a worktree nested in a grouping folder, naming the inner folder', async () => {
    const project = await alpha({
      ...checkout('.claude/worktrees/alpha-worktrees/avoidable'),
      '.claude/worktrees/alpha-worktrees/avoidable/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'done'),
    });

    expect(project.error).toBeUndefined();
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([['avoidable', 'avoidable']]);
  });

  it('ignores a .scratch in a folder that is not a worktree checkout', async () => {
    const project = await alpha({
      // A checkout's own subfolder (a monorepo package, say) is not a nested worktree.
      ...checkout('.claude/worktrees/feature-x'),
      '.claude/worktrees/feature-x/packages/ui/.scratch/ui-kit/issues/01-buttons.md': ticket('01: Buttons', 'done'),
      // A folder with a .scratch that git doesn't list as a worktree is not a checkout either.
      '.claude/worktrees/notes/.scratch/loose/issues/01-idea.md': ticket('01: Idea', 'done'),
    });

    expect(project.error).toBeUndefined();
    expect(project.features).toEqual([]);
  });

  it('adds nothing for a worktree whose .scratch has no Features', async () => {
    const project = await alpha({
      '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
      ...checkout('.claude/worktrees/15280-retro'),
      '.claude/worktrees/15280-retro/.scratch/15280/pr-retro.md': '# PR retro\n',
      '.claude/worktrees/15280-retro/README.md': '# A checkout\n',
    });

    expect(project.error).toBeUndefined();
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([['board', null]]);
  });
});

describe('readBoard: worktree Stories', () => {
  const story = (goal: string, status = 'active') =>
    `---\ngoal: ${goal}\nstatus: ${status}\n---\n\n## Next\nWaiting: in-step:implement\n`;

  it('reads Stories from worktrees, naming the worktree, and shows a Story in both once, from the main checkout', async () => {
    const project = await alpha({
      '.scratch/stories/kanban.md': story('Kanban, main copy'),
      ...checkout('.claude/worktrees/feature-x'),
      '.claude/worktrees/feature-x/.scratch/stories/kanban.md': story('Kanban, worktree copy'),
      '.claude/worktrees/feature-x/.scratch/stories/avoidable.md': story('Avoidable breaking changes'),
    });

    expect(project.error).toBeUndefined();
    expect(project.stories.map((s) => [s.slug, s.goal, s.worktree])).toEqual([
      ['kanban', 'Kanban, main copy', null],
      ['avoidable', 'Avoidable breaking changes', 'feature-x'],
    ]);
  });

  it('hides a Story that is done in the main checkout, even where a worktree still has it active', async () => {
    const project = await alpha({
      '.scratch/stories/kanban.md': story('Kanban', 'done'),
      ...checkout('.claude/worktrees/stale'),
      '.claude/worktrees/stale/.scratch/stories/kanban.md': story('Kanban', 'active'),
    });

    expect(project.stories).toEqual([]);
  });
});

describe('readBoard: unreadable worktrees', () => {
  it("marks the Project with an error naming a worktree whose .scratch can't be read, and keeps every other Feature", async () => {
    const project = await alpha({
      '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
      // A file where the worktree's .scratch folder should be: it exists but can't be listed.
      ...checkout('.claude/worktrees/broken'),
      '.claude/worktrees/broken/.scratch': 'not a folder',
      ...checkout('.claude/worktrees/fine'),
      '.claude/worktrees/fine/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'done'),
    });

    expect(project.error).toMatch(/worktree broken/);
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([
      ['board', null],
      ['avoidable', 'fine'],
    ]);
  });

  it("marks the Project with an error when .git/worktrees can't be listed, and keeps the main checkout's Features", async () => {
    const project = await alpha({
      '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
      '.git/worktrees': 'not a folder',
    });

    expect(project.error).toMatch(/\.git\/worktrees/);
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([['board', null]]);
  });

  it("marks the Project with an error naming a worktree that can't be checked, and keeps the main checkout's and other worktrees' Features", async () => {
    // The app's file system can refuse a path (outside its scope, say) instead of answering false.
    const refusing = refusingFileSystem((path) => path.includes('/.claude/worktrees/denied/'));
    const project = await alpha(
      {
        '.scratch/board/issues/01-shell.md': ticket('01: Shell', 'done'),
        ...checkout('.claude/worktrees/denied'),
        '.claude/worktrees/denied/.scratch/hidden/issues/01-a.md': ticket('01: A', 'done'),
        ...checkout('.claude/worktrees/fine'),
        '.claude/worktrees/fine/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'done'),
      },
      refusing,
    );

    expect(project.error).toBe("In worktree denied: Couldn't read .scratch: forbidden path");
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([
      ['board', null],
      ['avoidable', 'fine'],
    ]);
  });

  it("notes a worktree whose gitdir file can't be read, and still reads the other worktrees", async () => {
    const project = await alpha({
      // A folder where the gitdir file should be: it exists but can't be read as text.
      '.git/worktrees/broken/gitdir/stray': '',
      ...checkout('.claude/worktrees/fine'),
      '.claude/worktrees/fine/.scratch/avoidable/issues/01-audit.md': ticket('01: Audit', 'done'),
    });

    expect(project.error).toMatch(/\.git\/worktrees\/broken\/gitdir/);
    expect(project.features.map((f) => [f.slug, f.worktree])).toEqual([['avoidable', 'fine']]);
  });
});

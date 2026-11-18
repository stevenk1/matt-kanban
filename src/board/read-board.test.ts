import { mkdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeFileSystem } from './node-file-system';
import { readBoard } from './read-board';
import { GITHUB_TRACKER, LOCAL_TRACKER, makeTempRoot, removeTempRoot, tree } from './reader-fixtures';

let root: string;

beforeEach(async () => {
  root = await makeTempRoot('board-reader-');
});

afterEach(() => removeTempRoot(root));

describe('readBoard: Project discovery', () => {
  it('finds each folder under the scan root that has an issue tracker, with its tracker type', async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'beta/docs/agents/issue-tracker.md': GITHUB_TRACKER,
      'plain-folder/README.md': '# Not a Project\n',
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects).toEqual([
      { name: 'alpha', dir: join(root, 'alpha'), tracker: 'local', features: [], stories: [] },
      { name: 'beta', dir: join(root, 'beta'), tracker: 'github', features: [], stories: [] },
    ]);
  });

  it('names the scan roots it was read from, and none when no folder has been picked', async () => {
    await tree(root, { 'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER });

    const picked = await readBoard({ scanRoots: [root], fs: nodeFileSystem });
    const unpicked = await readBoard({ scanRoots: [], fs: nodeFileSystem });

    expect(picked.scanRoots).toEqual([root]);
    expect(unpicked).toMatchObject({ scanRoots: [], projects: [] });
  });

  it('reads the tracker type from the first line only', async () => {
    await tree(root, {
      'local-mentions-github/docs/agents/issue-tracker.md':
        '# Issue tracker: Local Markdown\n\nWe moved off GitHub Issues to `.scratch/`.\n',
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects.map((p) => [p.name, p.tracker])).toEqual([['local-mentions-github', 'local']]);
  });

  it('gathers Projects from every scan root and skips a scan root that does not exist', async () => {
    await tree(root, {
      'first/alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'second/beta/docs/agents/issue-tracker.md': GITHUB_TRACKER,
    });

    const board = await readBoard({
      scanRoots: [join(root, 'first'), join(root, 'missing'), join(root, 'second')],
      fs: nodeFileSystem,
    });

    expect(board.projects.map((p) => p.dir)).toEqual([join(root, 'first/alpha'), join(root, 'second/beta')]);
  });

  it('leaves out a hidden Project, named by its folder, and keeps a same-named Project in another scan root', async () => {
    await tree(root, {
      'first/alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'first/dormant/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'first/dormant/.scratch/old/issues/01-ready.md': '# Ready\n\n**Status:** ready-for-agent\n',
      'second/dormant/docs/agents/issue-tracker.md': GITHUB_TRACKER,
    });

    const board = await readBoard({
      scanRoots: [join(root, 'first'), join(root, 'second')],
      hiddenProjects: [join(root, 'first/dormant')],
      fs: nodeFileSystem,
    });

    expect(board.projects.map((p) => p.dir)).toEqual([join(root, 'first/alpha'), join(root, 'second/dormant')]);
  });
});

describe('readBoard: unreadable sources', () => {
  it('marks a Project whose tracker file cannot be read with an error, and keeps the other Projects', async () => {
    await tree(root, { 'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER });
    // A folder where the tracker file should be: it exists but can't be read as text.
    await mkdir(join(root, 'broken/docs/agents/issue-tracker.md'), { recursive: true });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects).toEqual([
      { name: 'alpha', dir: join(root, 'alpha'), tracker: 'local', features: [], stories: [] },
      {
        name: 'broken',
        dir: join(root, 'broken'),
        tracker: 'local',
        error: expect.stringMatching(/issue-tracker\.md/),
        features: [],
        stories: [],
      },
    ]);
  });

  it('reports a scan root that cannot be listed as an error entry, and still reads the other scan roots', async () => {
    await tree(root, {
      'not-a-folder': 'a file, not a folder',
      'second/beta/docs/agents/issue-tracker.md': GITHUB_TRACKER,
    });

    const board = await readBoard({
      scanRoots: [join(root, 'not-a-folder'), join(root, 'second')],
      fs: nodeFileSystem,
    });

    expect(board.projects).toEqual([
      {
        name: 'not-a-folder',
        dir: join(root, 'not-a-folder'),
        tracker: 'local',
        error: expect.stringMatching(/scan root/),
        features: [],
        stories: [],
      },
      { name: 'beta', dir: join(root, 'second/beta'), tracker: 'github', features: [], stories: [] },
    ]);
  });
});

describe('readBoard: Stories', () => {
  const MID_STEP_STORY = `---
goal: Kanban board tracking Matt Pocock-skill tickets across every Project
route: main flow (with prototype detour for UI designs)
status: active
waits-for:
---

## Artifacts
- Spec: .scratch/board/spec.md (ready-for-agent)

## Log
- 2026-11-17 story: started; matt-kanban has no docs/agents/issue-tracker.md yet
- 2026-11-17 to-tickets: 10 tickets approved as drafted
- 2026-11-17 implement 01: merged 182e788 (9 tests). Starting 02 + 06 in parallel

## Next
Waiting: in-step:implement
Recommended: implement 02 and 06 — fresh subagents in worktrees
`;

  it("reads a Story's goal, status, Waiting line and its step, Recommended line, last Log line and modification time", async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/kanban-board.md': MID_STEP_STORY,
    });
    const modified = new Date('2026-11-17T10:30:00Z');
    await utimes(join(root, 'alpha/.scratch/stories/kanban-board.md'), modified, modified);

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects[0].stories).toEqual([
      {
        slug: 'kanban-board',
        goal: 'Kanban board tracking Matt Pocock-skill tickets across every Project',
        status: 'active',
        waiting: 'in-step:implement',
        step: 'implement',
        recommended: 'implement 02 and 06 — fresh subagents in worktrees',
        lastLog: '2026-11-17 implement 01: merged 182e788 (9 tests). Starting 02 + 06 in parallel',
        updated: modified.getTime(),
        worktree: null,
      },
    ]);
  });

  it('uses the file name as the goal of a Story without frontmatter', async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/agent-skills-cull-pr.md':
        "## Summary\n\nTwo lines in the skills README.\n\n## Merge Danger\n\n**Door:** two-way\n",
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects[0].stories).toEqual([
      expect.objectContaining({
        slug: 'agent-skills-cull-pr',
        goal: 'agent-skills-cull-pr',
        status: '',
        waiting: null,
        step: null,
        recommended: null,
        lastLog: null,
      }),
    ]);
  });

  it('finds the frontmatter after a byte order mark', async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/bom.md': '﻿---\ngoal: Saved with a BOM\nstatus: active\n---\n',
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects[0].stories).toEqual([
      expect.objectContaining({ goal: 'Saved with a BOM', status: 'active' }),
    ]);
  });

  it('reads a Story with CRLF line endings', async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/crlf.md':
        '---\r\ngoal: Saved on Windows\r\nstatus: active\r\n---\r\n\r\n## Log\r\n- 2026-11-17 story: started\r\n\r\n## Next\r\nWaiting: in-step:grill-with-docs\r\n',
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects[0].stories).toEqual([
      expect.objectContaining({
        goal: 'Saved on Windows',
        status: 'active',
        waiting: 'in-step:grill-with-docs',
        step: 'grill-with-docs',
        lastLog: '2026-11-17 story: started',
      }),
    ]);
  });

  it('gives no step to a Story that is between steps or stopped', async () => {
    const story = (waiting: string) => `---\ngoal: A Story\nstatus: active\n---\n\n## Next\nWaiting: ${waiting}\n`;
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/between.md': story('next-step'),
      'alpha/.scratch/stories/stopped.md': story('stopped'),
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects[0].stories.map((s) => [s.waiting, s.step])).toEqual([
      ['next-step', null],
      ['stopped', null],
    ]);
  });

  it('leaves out done Stories, whatever the case or a note after it, and keeps every other status', async () => {
    const story = (status: string) => `---\ngoal: A ${status} Story\nroute: main flow\nstatus: ${status}\n---\n`;
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/finished.md': story('done'),
      'alpha/.scratch/stories/finished-capital.md': story('Done'),
      'alpha/.scratch/stories/finished-note.md': story('done (merged)'),
      'alpha/.scratch/stories/running.md': story('active'),
      'alpha/.scratch/stories/thinking.md': story('in progress'),
      'alpha/.scratch/stories/notes.txt': 'not a Story',
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects[0].stories.map((s) => [s.slug, s.status])).toEqual([
      ['running', 'active'],
      ['thinking', 'in progress'],
    ]);
  });

  it('keeps a Waiting note after the step, and ignores Waiting lines outside Next', async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/retro.md': `---
goal: Retro on the merge
status: active
---

## Artifacts
Waiting: in-step:implement (an old note in the Artifacts)

## Log
- 2026-11-16 implement: done
  a continuation line of that entry
- 2026-11-17 retro: picks applied

## Next
Waiting: in-step:retro (merge of a89c456 waits for the main checkout)
`,
    });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    expect(board.projects[0].stories).toEqual([
      expect.objectContaining({
        waiting: 'in-step:retro (merge of a89c456 waits for the main checkout)',
        step: 'retro',
        recommended: null,
        lastLog: '2026-11-17 retro: picks applied',
      }),
    ]);
  });

  it('marks the Project with an error naming a Story file that cannot be read, and keeps its other Stories', async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/stories/readable.md': '---\ngoal: Readable\nstatus: active\n---\n',
    });
    // A folder where a Story file should be: it can't be read as text.
    await mkdir(join(root, 'alpha/.scratch/stories/broken.md'), { recursive: true });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    const [alpha] = board.projects;
    expect(alpha.tracker).toBe('local');
    expect(alpha.error).toMatch(/\.scratch\/stories\/broken\.md/);
    expect(alpha.stories.map((s) => s.goal)).toEqual(['Readable']);
  });
});

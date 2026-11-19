import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Board, Feature } from './board';
import { fakeGitHub, issue, type FakeGitHubProject } from './fake-github';
import { nodeFileSystem } from './node-file-system';
import { readBoard } from './read-board';
import { GITHUB_TRACKER, LOCAL_TRACKER, makeTempRoot, removeTempRoot, tree } from './reader-fixtures';

let root: string;

beforeEach(async () => {
  root = await makeTempRoot('board-github-');
});

afterEach(() => removeTempRoot(root));

/** Reads a scan root holding one GitHub Project, `tv`, served by the fake GitHub port as `onGitHub`. */
async function readGitHubProject(onGitHub: FakeGitHubProject): Promise<Board> {
  await tree(root, { 'tv/docs/agents/issue-tracker.md': GITHUB_TRACKER });
  return readBoard({ scanRoots: [root], fs: nodeFileSystem, github: fakeGitHub({ [join(root, 'tv')]: onGitHub }) });
}

function featureTitled(board: Board, title: string): Feature {
  const feature = board.projects.flatMap((p) => p.features).find((f) => f.title === title);
  if (!feature) throw new Error(`no Feature titled ${title}`);
  return feature;
}

const OPENED = Date.UTC(2026, 9, 1);
const CLOSED = Date.UTC(2026, 9, 20);

describe('readBoard: GitHub Projects', () => {
  it('turns a Spec issue into a Feature whose Tickets are its native sub-issues', async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, {
          title: 'Spec: TV remote',
          body: '# The spec',
          updatedAt: OPENED,
          url: 'https://github.com/o/tv/issues/1',
        }),
        issue(2, {
          title: 'Walking skeleton',
          state: 'closed',
          labels: ['ready-for-agent'],
          body: '## What to build\n\n- [x] Lists apps\n- [ ] Launches apps\n',
          updatedAt: CLOSED,
          closedAt: CLOSED,
          url: 'https://github.com/o/tv/issues/2',
        }),
        issue(3, {
          title: 'Usage grid',
          labels: ['ready-for-agent'],
          body: 'Grid.',
          updatedAt: OPENED,
          url: 'https://github.com/o/tv/issues/3',
        }),
      ],
      subIssues: { 1: [2, 3] },
    });

    expect(board.projects[0].error).toBeUndefined();
    expect(board.projects[0].features).toEqual([
      {
        key: 'tv/#1',
        slug: '#1',
        title: 'TV remote',
        spec: '# The spec',
        issue: null,
        closed: false,
        updated: CLOSED,
        worktree: null,
        url: 'https://github.com/o/tv/issues/1',
        tickets: [
          {
            id: 'tv/#1/#2',
            num: '#2',
            title: 'Walking skeleton',
            state: 'done',
            rawStatus: 'done',
            statusNote: null,
            unknownStatus: false,
            blockers: [],
            openBlockers: [],
            blockerNote: null,
            criteria: { checked: 1, total: 2 },
            updated: CLOSED,
            location: { kind: 'url', url: 'https://github.com/o/tv/issues/2' },
            body: '## What to build\n\n- [x] Lists apps\n- [ ] Launches apps\n',
          },
          {
            id: 'tv/#1/#3',
            num: '#3',
            title: 'Usage grid',
            state: 'ready',
            rawStatus: 'ready-for-agent',
            statusNote: null,
            unknownStatus: false,
            blockers: [],
            openBlockers: [],
            blockerNote: null,
            criteria: { checked: 0, total: 0 },
            updated: OPENED,
            location: { kind: 'url', url: 'https://github.com/o/tv/issues/3' },
            body: 'Grid.',
          },
        ],
      },
    ]);
  });

  it('takes an issue whose body names a parent under "## Parent" as that Feature\'s Ticket', async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'SPEC TV remote' }),
        issue(14, { title: 'Focus glow', body: '## Parent\n\n#1\n\n## What to build\n\nA glow.' }),
        issue(15, { title: 'Native child' }),
      ],
      subIssues: { 1: [15] },
    });

    const feature = featureTitled(board, 'TV remote');
    expect(feature.tickets.map((t) => [t.num, t.title])).toEqual([
      ['#14', 'Focus glow'],
      ['#15', 'Native child'],
    ]);
  });

  it('also takes the one-line "## Parent #N" form', async () => {
    const board = await readGitHubProject({
      issues: [issue(1, { title: 'Spec: Launcher' }), issue(16, { title: 'One-liner', body: '## Parent #1\n\nText.' })],
    });

    expect(featureTitled(board, 'Launcher').tickets.map((t) => t.num)).toEqual(['#16']);
  });

  it('counts a closed issue as Done whatever its labels say', async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Launcher' }),
        issue(2, { state: 'closed', labels: ['ready-for-agent'], closedAt: CLOSED }),
        issue(3, { state: 'closed', labels: ['wontfix'], closedAt: CLOSED }),
      ],
      subIssues: { 1: [2, 3] },
    });

    expect(featureTitled(board, 'Launcher').tickets.map((t) => [t.num, t.state, t.updated])).toEqual([
      ['#2', 'done', CLOSED],
      ['#3', 'done', CLOSED],
    ]);
  });

  it("counts an open wontfix issue as Won't fix, a ready-for-human one as Your turn, and one with no triage label as Ready with an unknown status", async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Launcher' }),
        issue(2, { labels: ['enhancement', 'wontfix'] }),
        issue(3, { labels: ['enhancement'] }),
        issue(4, { labels: ['enhancement', 'needs-info'] }),
        issue(5, { labels: ['ready-for-human'] }),
      ],
      subIssues: { 1: [2, 3, 4, 5] },
    });

    expect(
      featureTitled(board, 'Launcher').tickets.map((t) => [t.num, t.state, t.rawStatus, t.unknownStatus]),
    ).toEqual([
      ['#2', 'wontfix', 'wontfix', false],
      ['#3', 'ready', '', true],
      ['#4', 'ready', 'needs-info', false],
      ['#5', 'yourturn', 'ready-for-human', false],
    ]);
  });

  it('blocks an open issue on the #N references in its "Blocked by", resolved within its Feature', async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Launcher' }),
        issue(2, { title: 'Open blocker' }),
        issue(3, { title: 'Inline line', body: '**Blocked by:** #2, #5' }),
        issue(4, { title: 'Template section', body: '## Blocked by\n\n- #5\n\n## Notes\n\nSee #2.' }),
        issue(5, { title: 'Done blocker', state: 'closed', closedAt: CLOSED }),
        issue(6, { title: 'None', body: '## Blocked by\n\nNone (can start immediately).' }),
        issue(7, { title: 'Elsewhere', body: 'Blocked by: #99' }),
      ],
      subIssues: { 1: [2, 3, 4, 5, 6, 7] },
    });

    expect(
      featureTitled(board, 'Launcher').tickets.map((t) => [t.num, t.state, t.blockers, t.openBlockers, t.blockerNote]),
    ).toEqual([
      ['#2', 'ready', [], [], null],
      ['#3', 'blocked', ['#2', '#5'], ['#2'], null],
      ['#4', 'ready', ['#5'], [], null],
      ['#5', 'done', [], [], null],
      ['#6', 'ready', [], [], null],
      ['#7', 'ready', ['#99'], [], '#99'],
    ]);
  });

  it('takes no blocker from prose that merely starts with "Blocked by", without the colon', async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Launcher' }),
        issue(2, { title: 'Open issue' }),
        issue(3, { title: 'Prose', body: 'Blocked by the API change, see #2.' }),
        issue(4, { title: 'Mid-line', body: 'This was Blocked by: #2 once.' }),
      ],
      subIssues: { 1: [2, 3, 4] },
    });

    expect(featureTitled(board, 'Launcher').tickets.map((t) => [t.num, t.state, t.blockers])).toEqual([
      ['#2', 'ready', []],
      ['#3', 'ready', []],
      ['#4', 'ready', []],
    ]);
  });

  it('groups issues with no Spec parent under a "No feature" Feature', async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Launcher' }),
        issue(2, { title: 'Child' }),
        issue(3, { title: 'Orphan', labels: ['ready-for-agent'] }),
        issue(4, { title: 'Child of a plain issue', body: '## Parent\n\n#3' }),
      ],
      subIssues: { 1: [2] },
    });

    expect(board.projects[0].features.map((f) => [f.key, f.slug, f.title, f.spec, f.tickets.map((t) => t.id)])).toEqual([
      ['tv/#1', '#1', 'Launcher', '', ['tv/#1/#2']],
      ['tv/no-feature', 'no-feature', 'No feature', null, ['tv/no-feature/#3', 'tv/no-feature/#4']],
    ]);
  });

  it('turns a Spec issue with no sub-issues into a Feature with no Tickets, its body as the spec', async () => {
    const board = await readGitHubProject({
      issues: [issue(7, { title: 'Spec: Remote control', body: '# Remote control\n\nThe spec.', updatedAt: OPENED })],
    });

    expect(board.projects[0].features).toEqual([
      {
        key: 'tv/#7',
        slug: '#7',
        title: 'Remote control',
        spec: '# Remote control\n\nThe spec.',
        issue: null,
        closed: false,
        updated: OPENED,
        worktree: null,
        url: 'https://github.com/owner/repo/issues/7',
        tickets: [],
      },
    ]);
  });
});

describe("readBoard: a GitHub Feature's own issue and its last change", () => {
  it('closes a Feature whose Spec issue is closed', async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Open spec' }),
        issue(2, { title: 'Spec: Closed spec', state: 'closed', closedAt: CLOSED }),
        issue(3, { title: 'Spec: Closed with an open Ticket', state: 'closed', closedAt: CLOSED }),
        issue(4, { title: 'Open Ticket' }),
        issue(5, { title: 'Orphan' }),
      ],
      subIssues: { 3: [4] },
    });

    expect(board.projects[0].features.map((f) => [f.title, f.closed])).toEqual([
      ['Open spec', false],
      ['Closed spec', true],
      ['Closed with an open Ticket', true],
      ['No feature', false],
    ]);
  });

  it('dates a Feature by the newest updatedAt of its Spec issue and its sub-issues', async () => {
    const day = (n: number) => Date.UTC(2026, 10, n);
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Spec newest', updatedAt: day(10) }),
        issue(2, { title: 'Older child', updatedAt: day(3) }),
        issue(3, { title: 'Spec: Child newest', updatedAt: day(1) }),
        issue(4, { title: 'Newer child', updatedAt: day(12), state: 'closed', closedAt: day(5) }),
        issue(5, { title: 'Spec: Alone', updatedAt: day(7) }),
        issue(6, { title: 'Orphan', updatedAt: day(4) }),
        issue(7, { title: 'Newer orphan', updatedAt: day(9) }),
      ],
      subIssues: { 1: [2], 3: [4] },
    });

    expect(board.projects[0].features.map((f) => [f.title, f.updated])).toEqual([
      ['Spec newest', day(10)],
      ['Child newest', day(12)],
      ['Alone', day(7)],
      ['No feature', day(9)],
    ]);
  });
});

describe('readBoard: unreadable GitHub Projects', () => {
  it('shows a failing issue list as an error on that Project, keeping its local Features and the other Projects', async () => {
    await tree(root, {
      'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER,
      'alpha/.scratch/board/issues/01-a.md': '# 01: A\n\n**Status:** ready-for-agent\n',
      'tv/docs/agents/issue-tracker.md': GITHUB_TRACKER,
      'tv/.scratch/notes/issues/01-local.md': '# 01: Local note\n\n**Status:** done\n',
    });
    const github = fakeGitHub({ [join(root, 'tv')]: { issues: [], failWith: 'gh: not logged in' } });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem, github });

    expect(board.projects.map((p) => [p.name, p.error, p.features.map((f) => f.key)])).toEqual([
      ['alpha', undefined, ['alpha/board']],
      ['tv', "Couldn't read the GitHub issues: gh: not logged in", ['tv/notes']],
    ]);
  });

  it("shows a failing sub-issue list as an error on that Project, still grouping by each issue's \"## Parent\"", async () => {
    const board = await readGitHubProject({
      issues: [
        issue(1, { title: 'Spec: Launcher' }),
        issue(2, { title: 'Named child', body: '## Parent\n\n#1' }),
        issue(3, { title: 'Native child' }),
      ],
      subIssues: { 1: new Error('HTTP 502') },
    });

    expect(board.projects[0].error).toBe("Couldn't read the sub-issues of #1: HTTP 502");
    expect(board.projects[0].features.map((f) => [f.title, f.tickets.map((t) => t.num)])).toEqual([
      ['Launcher', ['#2']],
      ['No feature', ['#3']],
    ]);
  });
});

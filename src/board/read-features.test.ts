import { chmod, mkdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Feature, Ticket } from './board';
import type { FileSystem } from './file-system';
import { nodeFileSystem } from './node-file-system';
import { readBoard } from './read-board';
import { LOCAL_TRACKER, makeTempRoot, removeTempRoot, tree } from './reader-fixtures';

let root: string;

beforeEach(async () => {
  root = await makeTempRoot('board-features-');
});

afterEach(() => removeTempRoot(root));

/** A Project `alpha` under the scan root, with the given files under its `.scratch/`. */
async function scratch(files: Record<string, string>) {
  await tree(root, { 'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER });
  await tree(join(root, 'alpha/.scratch'), files);
}

async function features(): Promise<Feature[]> {
  const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });
  return board.projects[0].features;
}

/** The Tickets of the only Feature, by number. */
async function ticketsByNum(): Promise<Record<string, Ticket>> {
  const [feature] = await features();
  return Object.fromEntries(feature.tickets.map((t) => [t.num, t]));
}

function ticket(fields: { title?: string; status?: string; blockedBy?: string; rest?: string }): string {
  return [
    `# ${fields.title ?? 'A Ticket'}`,
    '',
    '**What to build:** something.',
    '',
    fields.blockedBy === undefined ? '' : `**Blocked by:** ${fields.blockedBy}\n`,
    fields.status === undefined ? '' : `${fields.status}\n`,
    fields.rest ?? '',
  ].join('\n');
}

describe('readBoard: Features', () => {
  it('reads a Feature folder with a spec and its Tickets', async () => {
    const spec = '# Spec: Rail page\n\nThe rail page.\n';
    const text = ticket({ title: '01: Rail gallery', status: '**Status:** done' });
    await scratch({ 'rail-page/spec.md': spec, 'rail-page/issues/01-rail-gallery.md': text });

    const [feature] = await features();

    expect(feature).toEqual({
      key: 'alpha/rail-page',
      slug: 'rail-page',
      title: 'Rail page',
      spec,
      issue: null,
      closed: false,
      updated: expect.any(Number),
      worktree: null,
      tickets: [
        {
          id: 'alpha/rail-page/01',
          num: '01',
          title: 'Rail gallery',
          state: 'done',
          rawStatus: 'done',
          statusNote: null,
          unknownStatus: false,
          blockers: [],
          openBlockers: [],
          blockerNote: null,
          criteria: { checked: 0, total: 0 },
          updated: expect.any(Number),
          location: { kind: 'file', path: join(root, 'alpha/.scratch/rail-page/issues/01-rail-gallery.md') },
          body: text,
        },
      ],
    });
  });

  it('titles a Feature without a spec by its folder name, and skips folders without spec.md, issue.md or issues/', async () => {
    await scratch({
      'no-spec/issues/01-first.md': ticket({ status: '**Status:** done' }),
      'pr-only/pr.md': 'A PR description.\n',
      'notes-only/notes.md': '# Notes\n',
      'stories/some-story.md': '---\ngoal: a Story\n---\n',
    });

    const result = await features();

    expect(result.map((f) => [f.slug, f.title, f.spec])).toEqual([['no-spec', 'no-spec', null]]);
  });

  it('sorts Tickets by number', async () => {
    await scratch({
      'f/issues/10-ten.md': ticket({ status: 'Status: done' }),
      'f/issues/02-two.md': ticket({ status: 'Status: done' }),
      'f/issues/1-one.md': ticket({ status: 'Status: done' }),
    });

    const [feature] = await features();

    expect(feature.tickets.map((t) => t.num)).toEqual(['01', '02', '10']);
  });

  it("counts a Ticket's checked and total acceptance criteria", async () => {
    await scratch({
      'f/issues/01-a.md': ticket({
        status: '**Status:** ready-for-agent',
        rest: '- [x] first\n- [ ] second\n  - [X] nested\n- [ ] fourth\n\nNot a box: [ ] or -[x]\n',
      }),
    });

    const t = await ticketsByNum();

    expect(t['01'].criteria).toEqual({ checked: 2, total: 4 });
  });

  it("dates a Ticket by its file's modification time", async () => {
    await scratch({ 'f/issues/01-a.md': ticket({ status: '**Status:** done' }) });
    const changedAt = new Date('2026-11-03T10:00:00Z');
    await utimes(join(root, 'alpha/.scratch/f/issues/01-a.md'), changedAt, changedAt);

    const t = await ticketsByNum();

    expect(t['01'].updated).toBe(changedAt.getTime());
  });

  it("marks a Feature with an error naming a Ticket file that cannot be read, and keeps the Feature's other Tickets", async () => {
    await scratch({
      'f/issues/02-b.md': ticket({ status: '**Status:** ready-for-agent', blockedBy: '01' }),
      'g/issues/01-a.md': ticket({ status: '**Status:** done' }),
    });
    // A folder named like a Ticket: listed as one, but it can't be read as text.
    await mkdir(join(root, 'alpha/.scratch/f/issues/01-a.md'), { recursive: true });

    const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

    const [alpha] = board.projects;
    const [f, g] = alpha.features;
    expect(alpha.error).toBeUndefined();
    expect(f.error).toMatch(/01-a\.md/);
    expect(f.tickets.map((t) => [t.num, t.state])).toEqual([['02', 'ready']]);
    expect(g.error).toBeUndefined();
    expect(g.tickets.map((t) => t.num)).toEqual(['01']);
  });

  it('keeps both messages on the Project when its Features and its Stories cannot all be read', async () => {
    await scratch({ 'f/issues/01-a.md': ticket({ status: '**Status:** done' }) });
    // A Story file that can't be read as text.
    await mkdir(join(root, 'alpha/.scratch/stories/broken.md'), { recursive: true });
    // .scratch can be passed through (to the Stories) but not listed (for the Features).
    const scratchDir = join(root, 'alpha/.scratch');
    await chmod(scratchDir, 0o100);
    try {
      const board = await readBoard({ scanRoots: [root], fs: nodeFileSystem });

      const [alpha] = board.projects;
      expect(alpha.features).toEqual([]);
      expect(alpha.error).toMatch(/Features/);
      expect(alpha.error).toMatch(/stories\/broken\.md/);
    } finally {
      await chmod(scratchDir, 0o755);
    }
  });

  it('has no Features when the Project has no .scratch folder', async () => {
    await tree(root, { 'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER });

    expect(await features()).toEqual([]);
  });
});

describe('readBoard: Features with no Tickets', () => {
  it('reads a folder with a spec.md but no issues/ as a Feature with no Tickets', async () => {
    const spec = '# Spec: Pre-ticket work\n\nShow work before it has Tickets.\n';
    await scratch({ 'pre-ticket-work/spec.md': spec });

    const [feature] = await features();

    expect(feature).toEqual({
      key: 'alpha/pre-ticket-work',
      slug: 'pre-ticket-work',
      title: 'Pre-ticket work',
      spec,
      issue: null,
      closed: false,
      updated: expect.any(Number),
      worktree: null,
      tickets: [],
    });
  });

  it("reads a folder with an issue.md but no issues/ as a Feature with no Tickets, titled by the issue's heading", async () => {
    const issue = '# Work item 1043: Pause the import\n\nStatus: ready-for-agent\n';
    await scratch({ '1043/issue.md': issue });

    const [feature] = await features();

    expect(feature).toMatchObject({ slug: '1043', title: 'Work item 1043: Pause the import', spec: null, issue, tickets: [] });
  });

  it("titles a Feature by its spec's heading, else its issue's, else its folder name", async () => {
    const bothIssue = '# Issue heading\n\nStatus: ready-for-agent\n';
    await scratch({
      'a-both/spec.md': '# Spec: Spec heading\n',
      'a-both/issue.md': bothIssue,
      'b-headless-spec/spec.md': 'A spec with no heading yet.\n',
      'b-headless-spec/issue.md': '# Issue heading only\n',
      'c-no-headings/issue.md': 'Status: needs-triage\n',
    });

    const result = await features();

    expect(result.map((f) => [f.slug, f.title, f.tickets])).toEqual([
      ['a-both', 'Spec heading', []],
      ['b-headless-spec', 'Issue heading only', []],
      ['c-no-headings', 'c-no-headings', []],
    ]);
    expect(result[0].issue).toBe(bothIssue);
  });

  it('skips a folder with none of spec.md, issue.md or issues/', async () => {
    await scratch({ '15280/pr.md': '# PR: Pause the import\n', 'f/spec.md': '# Spec: F\n' });

    const result = await features();

    expect(result.map((f) => f.slug)).toEqual(['f']);
  });

  it('reads a folder with an empty issues/ and no spec or issue as a Feature with no Tickets, dated 0', async () => {
    await mkdir(join(root, 'alpha/.scratch/empty/issues'), { recursive: true });
    await tree(root, { 'alpha/docs/agents/issue-tracker.md': LOCAL_TRACKER });

    const result = await features();

    expect(result.map((f) => [f.slug, f.title, f.spec, f.issue, f.tickets, f.updated])).toEqual([
      ['empty', 'empty', null, null, [], 0],
    ]);
  });

  it('reads the issue.md of a Feature that has Tickets too', async () => {
    const issue = '# Rail page\n\nStatus: ready-for-agent\n';
    await scratch({ 'rail/issue.md': issue, 'rail/issues/01-a.md': ticket({ status: '**Status:** ready-for-agent' }) });

    const [feature] = await features();

    expect([feature.title, feature.issue, feature.tickets.length]).toEqual(['Rail page', issue, 1]);
  });

  it("names an issue.md that can't be read in the Feature's error", async () => {
    await scratch({ 'f/spec.md': '# Spec: F\n' });
    // A folder named like the issue: it exists, but can't be read as text.
    await mkdir(join(root, 'alpha/.scratch/f/issue.md'));

    const [feature] = await features();

    expect([feature.title, feature.issue, feature.tickets]).toEqual(['F', null, []]);
    expect(feature.error).toMatch(/^Couldn't read issue\.md: /);
  });
});

describe("readBoard: a Feature's own issue and its last change", () => {
  it('closes a Feature whose issue.md Status is done or wontfix, and no other', async () => {
    await scratch({
      'a-done/issue.md': '# A\n\n**Status:** done\n',
      'b-wontfix/issue.md': '# B\n\nStatus: wontfix (moved to 15230)\n',
      'c-ready/issue.md': '# C\n\nStatus: ready-for-agent\n\n## Comments\n\nStatus: done\n',
      'd-doneish/issue.md': '# D\n\nStatus: doneish\n',
      'e-spec-only/spec.md': '# Spec: E\n\nStatus: done\n',
    });

    const result = await features();

    expect(result.map((f) => [f.slug, f.closed])).toEqual([
      ['a-done', true],
      ['b-wontfix', true],
      ['c-ready', false],
      ['d-doneish', false],
      ['e-spec-only', false],
    ]);
  });

  it('dates a Feature by the newest of its Ticket files, spec.md and issue.md', async () => {
    await scratch({
      'spec-newest/spec.md': '# Spec: S\n',
      'spec-newest/issue.md': '# S\n',
      'spec-newest/issues/01-a.md': ticket({ status: '**Status:** done' }),
      'issue-newest/spec.md': '# Spec: I\n',
      'issue-newest/issue.md': '# I\n',
      'ticket-newest/spec.md': '# Spec: T\n',
      'ticket-newest/issues/01-a.md': ticket({ status: '**Status:** done' }),
      'ticket-newest/issues/02-b.md': ticket({ status: '**Status:** done' }),
    });
    const at = (iso: string) => new Date(iso);
    const times: Record<string, string> = {
      'spec-newest/spec.md': '2026-11-10T00:00:00Z',
      'spec-newest/issue.md': '2026-11-02T00:00:00Z',
      'spec-newest/issues/01-a.md': '2026-11-05T00:00:00Z',
      'issue-newest/spec.md': '2026-11-01T00:00:00Z',
      'issue-newest/issue.md': '2026-11-08T00:00:00Z',
      'ticket-newest/spec.md': '2026-11-01T00:00:00Z',
      'ticket-newest/issues/01-a.md': '2026-11-12T00:00:00Z',
      'ticket-newest/issues/02-b.md': '2026-11-03T00:00:00Z',
    };
    for (const [path, iso] of Object.entries(times)) {
      await utimes(join(root, 'alpha/.scratch', path), at(iso), at(iso));
    }

    const result = await features();

    expect(result.map((f) => [f.slug, new Date(f.updated).toISOString()])).toEqual([
      ['issue-newest', '2026-11-08T00:00:00.000Z'],
      ['spec-newest', '2026-11-10T00:00:00.000Z'],
      ['ticket-newest', '2026-11-12T00:00:00.000Z'],
    ]);
  });

  it("keeps a spec whose text reads but whose time can't, dating it 0", async () => {
    const spec = '# Spec: Timeless\n\nThe spec.\n';
    await scratch({ 'f/spec.md': spec });
    // The text reads; only the file's time fails.
    const fs: FileSystem = {
      ...nodeFileSystem,
      stat: (path) => (path.endsWith('/spec.md') ? Promise.reject(new Error('stat failed')) : nodeFileSystem.stat(path)),
    };

    const board = await readBoard({ scanRoots: [root], fs });

    const [feature] = board.projects[0].features;
    expect([feature.title, feature.spec, feature.updated, feature.error]).toEqual(['Timeless', spec, 0, undefined]);
  });
});

describe('readBoard: Ticket status', () => {
  it('reads the status from a bold or a plain Status line', async () => {
    await scratch({
      'f/issues/01-bold.md': ticket({ status: '**Status:** done' }),
      'f/issues/02-plain.md': ticket({ status: 'Status: wontfix' }),
    });

    const t = await ticketsByNum();

    expect([t['01'].state, t['01'].rawStatus]).toEqual(['done', 'done']);
    expect([t['02'].state, t['02'].rawStatus]).toEqual(['wontfix', 'wontfix']);
  });

  it('uses the first Status line and ignores later ones in the Comments', async () => {
    await scratch({
      'f/issues/01-first.md': ticket({
        status: '**Status:** ready-for-agent',
        rest: '## Comments\n\n**Status:** done (said the agent, too early)\n',
      }),
    });

    const t = await ticketsByNum();

    expect([t['01'].state, t['01'].rawStatus, t['01'].statusNote]).toEqual(['ready', 'ready-for-agent', null]);
  });

  it('keeps text after the status value as a note', async () => {
    await scratch({ 'f/issues/01-moved.md': ticket({ status: '**Status:** wontfix (moved to flowbuilder-ui 02)' }) });

    const t = await ticketsByNum();

    expect(t['01']).toMatchObject({
      state: 'wontfix',
      rawStatus: 'wontfix',
      statusNote: '(moved to flowbuilder-ui 02)',
      unknownStatus: false,
    });
  });

  it('keeps the triage statuses that are neither done nor wontfix visible, as Ready', async () => {
    await scratch({
      'f/issues/01-human.md': ticket({ status: 'Status: ready-for-human' }),
      'f/issues/02-triage.md': ticket({ status: 'Status: needs-triage' }),
      'f/issues/03-info.md': ticket({ status: 'Status: needs-info' }),
    });

    const t = await ticketsByNum();

    expect(Object.values(t).map((x) => [x.state, x.rawStatus, x.unknownStatus])).toEqual([
      ['ready', 'ready-for-human', false],
      ['ready', 'needs-triage', false],
      ['ready', 'needs-info', false],
    ]);
  });

  it('makes a Ticket with an unknown or missing status Ready and flags it', async () => {
    await scratch({
      'f/issues/01-odd.md': ticket({ status: '**Status:** in progress' }),
      'f/issues/02-none.md': ticket({}),
      'f/issues/03-almost.md': ticket({ status: '**Status:** doneish' }),
    });

    const t = await ticketsByNum();

    expect(Object.values(t).map((x) => [x.state, x.rawStatus, x.statusNote, x.unknownStatus])).toEqual([
      ['ready', 'in progress', null, true],
      ['ready', '', null, true],
      ['ready', 'doneish', null, true],
    ]);
  });
});

describe('readBoard: Blocked by and Ticket state', () => {
  const DONE = '**Status:** done';
  const READY = '**Status:** ready-for-agent';

  it('makes a Ticket Blocked while a same-Feature blocker is not Done, and Ready once all are Done', async () => {
    await scratch({
      'f/issues/01-a.md': ticket({ status: DONE, blockedBy: 'None (can start immediately)' }),
      'f/issues/02-b.md': ticket({ status: READY, blockedBy: '01' }),
      'f/issues/03-c.md': ticket({ status: READY, blockedBy: '01, 02' }),
    });

    const t = await ticketsByNum();

    expect(Object.values(t).map((x) => [x.num, x.state, x.blockers, x.openBlockers, x.blockerNote])).toEqual([
      ['01', 'done', [], [], null],
      ['02', 'ready', ['01'], [], null],
      ['03', 'blocked', ['01', '02'], ['02'], null],
    ]);
  });

  it('reads blocker numbers followed by titles, and pads single digits', async () => {
    await scratch({
      'f/issues/01-a.md': ticket({ status: READY }),
      'f/issues/02-b.md': ticket({ status: READY }),
      'f/issues/03-c.md': ticket({ status: READY, blockedBy: '1 Rail gallery, 02 Rail detail and 01' }),
    });

    const t = await ticketsByNum();

    expect(t['03']).toMatchObject({
      state: 'blocked',
      blockers: ['01', '02'],
      openBlockers: ['01', '02'],
      blockerNote: null,
    });
  });

  it('does not split a blocker title on an "and" inside it', async () => {
    await scratch({
      'f/issues/01-a.md': ticket({ status: READY }),
      'f/issues/02-b.md': ticket({ status: READY }),
      'f/issues/03-c.md': ticket({ status: READY, blockedBy: '01 Library folder, 02 Begin and end a sitting' }),
    });

    const t = await ticketsByNum();

    expect(t['03']).toMatchObject({ blockers: ['01', '02'], blockerNote: null });
  });

  it('keeps prose with parentheses as a note, and still blocks on the numbers in it', async () => {
    const raw = '01 (A device has a port), 02 (The camera fake)';
    await scratch({
      'f/issues/01-a.md': ticket({ status: DONE }),
      'f/issues/02-b.md': ticket({ status: READY }),
      'f/issues/03-c.md': ticket({ status: READY, blockedBy: raw }),
    });

    const t = await ticketsByNum();

    expect(t['03']).toMatchObject({ state: 'blocked', blockers: ['01', '02'], openBlockers: ['02'], blockerNote: raw });
  });

  it('keeps prose it cannot turn into Ticket numbers as a note that does not block', async () => {
    const raw = '05, and the node-ports story (a49bc86). Build it on that model once it lands.';
    await scratch({
      'f/issues/01-a.md': ticket({ status: READY, blockedBy: 'the camera story' }),
      'f/issues/05-e.md': ticket({ status: DONE }),
      'f/issues/06-f.md': ticket({ status: READY, blockedBy: raw }),
    });

    const t = await ticketsByNum();

    expect(t['01']).toMatchObject({ state: 'ready', blockers: [], openBlockers: [], blockerNote: 'the camera story' });
    expect(t['06']).toMatchObject({ state: 'ready', blockers: ['05'], openBlockers: [], blockerNote: raw });
  });

  it("counts a Won't fix blocker as cleared", async () => {
    await scratch({
      'f/issues/01-a.md': ticket({ status: '**Status:** wontfix (moved)' }),
      'f/issues/02-b.md': ticket({ status: READY, blockedBy: '01' }),
    });

    const t = await ticketsByNum();

    expect(t['02']).toMatchObject({ state: 'ready', blockers: ['01'], openBlockers: [] });
  });

  it('keeps a Done or Won\'t fix Ticket in its state whatever its blockers', async () => {
    await scratch({
      'f/issues/01-a.md': ticket({ status: READY }),
      'f/issues/02-b.md': ticket({ status: DONE, blockedBy: '01' }),
      'f/issues/03-c.md': ticket({ status: '**Status:** wontfix', blockedBy: '01' }),
    });

    const t = await ticketsByNum();

    expect([t['02'].state, t['03'].state]).toEqual(['done', 'wontfix']);
  });

  it('resolves blockers only within the same Feature', async () => {
    await scratch({
      'first/issues/01-a.md': ticket({ status: DONE }),
      'first/issues/02-b.md': ticket({ status: READY, blockedBy: '01' }),
      'second/issues/01-a.md': ticket({ status: READY }),
      'second/issues/02-b.md': ticket({ status: READY, blockedBy: '01, 03' }),
    });

    const [first, second] = await features();

    expect(first.tickets[1]).toMatchObject({ state: 'ready', openBlockers: [] });
    expect(second.tickets[1]).toMatchObject({ state: 'blocked', blockers: ['01', '03'], openBlockers: ['01'] });
    expect(second.tickets[1].blockerNote).toBe('01, 03');
  });

  it('reads a plain Blocked by line too', async () => {
    await scratch({
      'f/issues/01-a.md': ticket({ status: READY }),
      'f/issues/02-b.md': ticket({ status: READY, rest: 'Blocked by: 01\n' }),
    });

    const t = await ticketsByNum();

    expect(t['02']).toMatchObject({ state: 'blocked', openBlockers: ['01'] });
  });
});

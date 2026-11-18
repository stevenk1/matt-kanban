// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Board, Project, Story } from '../board/board';
import {
  boardOf,
  boardWith,
  clickCard,
  feature,
  featurePane,
  NOW,
  project,
  renderBoardView,
  selectFeature,
  ticket,
} from './board-fixtures';

describe('BoardView: sidebar', () => {
  it('lists All Projects, then each Project with its tracker type', () => {
    const board: Board = boardWith({
      readAt: 0,
      projects: [project('Billing'), project('TvRemote', [], { tracker: 'github' })],
    });

    renderBoardView(board);

    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    const items = within(sidebar).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/^All Projects$/);
    expect(items[1]).toHaveTextContent(/^Billing\s*local$/);
    expect(items[2]).toHaveTextContent(/^TvRemote\s*GitHub$/);
  });

  it('shows the error on a Project that could not be read', () => {
    const broken: Project = { ...project('broken'), error: "Couldn't read docs/agents/issue-tracker.md" };
    renderBoardView(boardWith({ readAt: 0, projects: [project('alpha'), broken] }));

    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    const [, alpha, brokenItem] = within(sidebar).getAllByRole('listitem');
    expect(within(brokenItem).getByText("Couldn't read docs/agents/issue-tracker.md")).toBeInTheDocument();
    expect(alpha).not.toHaveTextContent("Couldn't read");
  });

  it('says so when no Projects were found', () => {
    renderBoardView(boardWith({ readAt: 0, projects: [] }));

    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    expect(within(sidebar).getByText('No Projects found')).toBeInTheDocument();
  });

  it('asks for a folder to read, in place of the panes, until a scan root is picked', async () => {
    const { onAddFolder } = renderBoardView({ readAt: 0, scanRoots: [], projects: [] });

    expect(screen.getByRole('heading', { name: 'Pick the folder that holds your projects' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Projects' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Folder…' }));
    expect(onAddFolder).toHaveBeenCalledOnce();
  });
});

/** A Story mid-step in `step`, or between steps when `step` is null. */
function story(slug: string, goal: string, step: string | null, updated = 0): Story {
  const waiting = step ? `in-step:${step}` : 'next-step';
  return { slug, goal, status: 'active', waiting, step, recommended: null, lastLog: null, updated, worktree: null };
}

describe('BoardView: Stories in a step', () => {
  const board: Board = boardWith({
    readAt: 0,
    projects: [
      {
        ...project('matt-kanban'),
        stories: [
          story('kanban-board', 'Kanban board across every Project', 'implement', 200),
          story('waiting-story', 'A Story between steps', null, 300),
          { ...story('no-next', 'A Story without a Next section', null, 300), waiting: null },
        ],
      },
      {
        ...project('Sketches'),
        stories: [story('export-guide', 'Write the export guide', 'retro', 100)],
      },
      {
        ...project('Billing'),
        stories: [story('faster-import', 'Speed up the import', 'tdd', 400)],
      },
    ],
  });

  function storyItems() {
    const list = screen.getByRole('list', { name: 'Stories in a step' });
    return within(list)
      .queryAllByRole('listitem')
      .map((item) => item.textContent);
  }

  it('lists only the mid-step Stories, newest first, each with its goal, Project and step', () => {
    renderBoardView(board);

    expect(storyItems()).toEqual([
      'Speed up the importBilling · tdd',
      'Kanban board across every Projectmatt-kanban · implement',
      'Write the export guideSketches · retro',
    ]);
  });

  it('shows only the selected Project’s Stories, and all of them again under All Projects', async () => {
    const user = userEvent.setup();
    renderBoardView(board);
    const sidebar = screen.getByRole('navigation', { name: 'Projects' });

    await user.click(within(sidebar).getByRole('button', { name: /^Sketches/ }));
    expect(storyItems()).toEqual(['Write the export guideSketches · retro']);
    expect(within(sidebar).getByRole('button', { name: /^Sketches/ })).toHaveAttribute('aria-current', 'true');

    await user.click(within(sidebar).getByRole('button', { name: /^matt-kanban/ }));
    expect(storyItems()).toEqual(['Kanban board across every Projectmatt-kanban · implement']);

    await user.click(within(sidebar).getByRole('button', { name: 'All Projects' }));
    expect(storyItems()).toHaveLength(3);
  });

  it('says so when no Story is in a step', () => {
    const keepsStories = project('alpha', [], { stories: [story('between', 'Between steps', null)] });
    renderBoardView(boardWith({ readAt: 0, projects: [keepsStories] }));

    expect(storyItems()).toEqual([]);
    expect(screen.getByText('No Stories in a step')).toBeInTheDocument();
  });

  it('keeps the Stories section when the selected Project keeps none but another does', async () => {
    const user = userEvent.setup();
    const keepsStories = project('alpha', [], { stories: [story('between', 'Between steps', null)] });
    renderBoardView(boardWith({ readAt: 0, projects: [keepsStories, project('beta')] }));

    await user.click(within(screen.getByRole('navigation', { name: 'Projects' })).getByRole('button', { name: /^beta/ }));

    expect(screen.getByText('No Stories in a step')).toBeInTheDocument();
  });

  it('leaves Stories out of the sidebar when no Project keeps any: they are optional', () => {
    renderBoardView(boardWith({ readAt: 0, projects: [project('alpha')] }));

    expect(screen.queryByText('Stories in a step')).not.toBeInTheDocument();
    expect(screen.queryByText('No Stories in a step')).not.toBeInTheDocument();
  });
});

describe('BoardView: layout', () => {
  it('shows the three panes: Projects, Features and the selected Feature', () => {
    renderBoardView(boardWith({ readAt: 0, projects: [project('alpha')] }));

    expect(screen.getByRole('navigation', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Features' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Feature' })).toBeInTheDocument();
  });
});

describe('BoardView: a Feature with no Tickets', () => {
  const board: Board = boardWith({
    readAt: NOW,
    projects: [
      project('alpha', [
        feature('Specified', [], {
          spec: '# Spec: Specified\n\nShow work **before** it has Tickets.\n',
          issue: '# Specified\n\nThe triaged issue.\n',
        }),
        feature('Triaged', [], { issue: '# Triaged\n\nA work item still in grilling.\n' }),
      ]),
    ],
  });

  it('shows its spec, rendered, in place of the mini-board', async () => {
    renderBoardView(board);

    await selectFeature('Specified');

    const spec = within(featurePane()).getByRole('region', { name: 'Spec' });
    expect(within(spec).getByText('before').tagName).toBe('STRONG');
    expect(spec).toHaveTextContent('Show work before it has Tickets.');
    expect(within(featurePane()).queryByRole('region', { name: 'Issue' })).toBeNull();
    expect(within(featurePane()).queryByRole('region', { name: 'Ready' })).toBeNull();
    expect(featurePane()).toHaveTextContent('alpha');
  });

  it('shows its issue when it has no spec', async () => {
    renderBoardView(board);

    await selectFeature('Triaged');

    const issue = within(featurePane()).getByRole('region', { name: 'Issue' });
    expect(issue).toHaveTextContent('A work item still in grilling.');
    expect(within(featurePane()).queryByRole('region', { name: 'Ready' })).toBeNull();
  });

  it('shows the mini-board when it has neither a spec nor an issue', async () => {
    renderBoardView(boardWith({ readAt: NOW, projects: [project('alpha', [feature('Empty issues folder', [])])] }));

    await selectFeature('Empty issues folder');

    expect(within(featurePane()).getByRole('region', { name: 'Ready' })).toBeInTheDocument();
  });
});

describe('BoardView: live update', () => {
  it('keeps the selected Project, Feature and open Ticket across a new Board', async () => {
    const user = userEvent.setup();
    const before: Board = boardWith({
      readAt: NOW,
      projects: [
        project('alpha', [feature('Rail page', [ticket('01', 'ready')])]),
        project('beta', [feature('Main work', [ticket('01', 'ready'), ticket('02', 'ready')]), feature('Other', [])]),
      ],
    });
    const { showBoard } = renderBoardView(before);
    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    await user.click(within(sidebar).getByRole('button', { name: /^beta/ }));
    await selectFeature('Main work');
    await clickCard('02');

    // A new Project sorts first, alpha changes, and the open Ticket is now Done with a new body.
    showBoard(boardWith({
      readAt: NOW + 60_000,
      projects: [
        project('aardvark', [feature('Zoo', [ticket('01', 'ready')])]),
        project('alpha', [feature('Rail page', [ticket('01', 'done')])]),
        project('beta', [
          feature('Main work', [
            ticket('01', 'ready'),
            ticket('02', 'done', { body: '# 02: Ticket 02\n\nNow done.\n' }),
            ticket('03', 'ready'),
          ]),
          feature('Other', []),
        ]),
      ],
    }));

    expect(within(sidebar).getByRole('button', { name: /^beta/ })).toHaveAttribute('aria-current', 'true');
    const features = screen.getByRole('region', { name: 'Features' });
    expect(within(features).queryByRole('button', { name: 'Zoo' })).toBeNull();
    expect(within(features).getByRole('button', { name: 'Main work' })).toHaveAttribute('aria-current', 'true');
    const detail = within(featurePane()).getByRole('article');
    expect(within(detail).getByRole('heading', { name: /02/ })).toBeInTheDocument();
    expect(detail).toHaveTextContent('Now done.');
  });
});

describe('BoardView: revealing a Ticket from the menu-bar popover', () => {
  const board: Board = boardWith({
    readAt: NOW,
    projects: [
      project('alpha', [feature('Rail page', [ticket('01', 'ready', { title: 'Begin a sitting' })])]),
      project('beta', [
        feature('Board reader', [ticket('01', 'done'), ticket('02', 'ready', { title: 'Read GitHub' })]),
        feature('Menu bar', [ticket('02', 'ready', { title: 'Tray count' })]),
      ]),
    ],
  });

  function selectedProject() {
    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    return within(sidebar).getByRole('button', { current: true });
  }

  function selectedFeature() {
    const list = screen.getByRole('region', { name: 'Features' });
    return within(list).getByRole('button', { current: true });
  }

  function detailTitle() {
    return within(within(featurePane()).getByRole('article')).getByRole('heading', { level: 2 });
  }

  it("selects the Ticket's Project and Feature and opens its detail", async () => {
    const { reveal } = renderBoardView(board);
    await selectFeature('Rail page');

    reveal('beta/menu-bar/02');

    expect(selectedProject()).toHaveAccessibleName(/^beta/);
    expect(selectedFeature()).toHaveAccessibleName('Menu bar');
    expect(detailTitle()).toHaveTextContent(/02\s*Tray count/);
  });

  it('reveals the same Ticket again after going back to its Feature', async () => {
    const { reveal } = renderBoardView(board);
    reveal('beta/board-reader/02');
    await userEvent.setup().click(within(featurePane()).getByRole('button', { name: /Back to Board reader/ }));

    reveal('beta/board-reader/02');

    expect(detailTitle()).toHaveTextContent(/02\s*Read GitHub/);
  });

  it('never reveals a handled request again when the view is rebuilt', async () => {
    const { reveal, rebuild } = renderBoardView(board);
    reveal('beta/menu-bar/02');
    await userEvent.setup().click(within(featurePane()).getByRole('button', { name: /Back to Menu bar/ }));

    rebuild();

    expect(within(featurePane()).queryByRole('article')).toBeNull();
    expect(within(featurePane()).getByText('Select a Feature')).toBeInTheDocument();
  });

  it('leaves the selection alone when the Ticket is no longer on the Board', async () => {
    const { reveal } = renderBoardView(board);
    await selectFeature('Rail page');

    reveal('beta/menu-bar/09');

    expect(selectedProject()).toHaveAccessibleName(/^All Projects/);
    expect(selectedFeature()).toHaveAccessibleName('Rail page');
    expect(within(featurePane()).getByRole('heading', { name: 'Rail page' })).toBeInTheDocument();
  });
});

describe('BoardView: view animations', () => {
  /** The right pane's view, which plays its enter animation once, when it is inserted. */
  function paneView() {
    const view = featurePane().firstElementChild;
    if (!view) throw new Error('The Feature pane is empty');
    return view;
  }

  function readWith(body: string): Board {
    return boardOf(feature('Rail page', [ticket('01', 'ready'), ticket('02', 'ready', { body: `# 02: x\n\n${body}\n` })]));
  }

  it('keeps the Feature view and the Ticket detail across a new Board, so no view animation plays again', async () => {
    const { showBoard } = renderBoardView(readWith('First read.'));
    await selectFeature('Rail page');
    const featureView = paneView();

    showBoard(readWith('Second read.'));
    expect(paneView()).toBe(featureView);

    await clickCard('02');
    const detail = within(featurePane()).getByRole('article');

    showBoard(readWith('Third read.'));
    expect(within(featurePane()).getByRole('article')).toBe(detail);
    expect(detail).toHaveTextContent('Third read.');

    await userEvent.setup().click(within(featurePane()).getByRole('button', { name: /Back to/ }));
    const featureViewAgain = paneView();

    showBoard(readWith('Fourth read.'));
    expect(paneView()).toBe(featureViewAgain);
  });

  it('keeps the Feature list across a new Board that brings the first Features, so its fade doesn’t play', () => {
    const { showBoard } = renderBoardView(boardWith({ readAt: NOW, projects: [project('alpha')] }));
    const rows = within(screen.getByRole('region', { name: 'Features' })).getByRole('list');

    showBoard(boardOf(feature('Rail page', [ticket('01', 'ready')])));

    expect(within(screen.getByRole('region', { name: 'Features' })).getByRole('list')).toBe(rows);
    expect(within(rows).getByRole('button', { name: 'Rail page' })).toBeInTheDocument();
  });

  it('slides a Ticket in from the right, Back slides its Feature in from the left, and a Feature switch fades', async () => {
    renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready')]), feature('Main work', [ticket('01', 'ready')])));

    await selectFeature('Rail page');
    expect(paneView()).toHaveClass('feature-pane-view-switch');

    const railPage = paneView();
    await clickCard('02');
    expect(paneView()).not.toBe(railPage);
    expect(paneView()).toHaveClass('feature-pane-view-open');

    await userEvent.setup().click(within(featurePane()).getByRole('button', { name: /Back to/ }));
    expect(paneView()).toHaveClass('feature-pane-view-back');

    const railPageAgain = paneView();
    await selectFeature('Main work');
    expect(paneView()).not.toBe(railPageAgain);
    expect(paneView()).toHaveClass('feature-pane-view-switch');
  });

  it('fades the Feature pane and the Feature list when another Project is picked', async () => {
    const user = userEvent.setup();
    renderBoardView(
      boardWith({
        readAt: NOW,
        projects: [project('alpha', [feature('Rail page', [])]), project('beta', [feature('Main work', [])])],
      }),
    );
    const rows = () => within(screen.getByRole('region', { name: 'Features' })).getByRole('list');
    const allRows = rows();

    await user.click(within(screen.getByRole('navigation', { name: 'Projects' })).getByRole('button', { name: /^beta/ }));

    expect(rows()).not.toBe(allRows);
    expect(paneView()).toHaveClass('feature-pane-view-switch');
  });

  it('slides a Ticket revealed from the menu-bar popover in from the right', () => {
    const { reveal } = renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready')])));

    reveal('alpha/rail-page/02');

    expect(within(featurePane()).getByRole('article')).toBeInTheDocument();
    expect(paneView()).toHaveClass('feature-pane-view-open');
  });
});

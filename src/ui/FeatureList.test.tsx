// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Board, Feature } from '../board/board';
import { DAY, feature, NOW, project, renderBoardView, ticketsIn, boardWith } from './board-fixtures';

function featureRows() {
  return within(screen.getByRole('region', { name: 'Features' })).queryAllByRole('listitem');
}

function featureTitles() {
  return featureRows().map((row) => within(row).getByRole('heading').textContent);
}

describe('BoardView: Feature list', () => {
  it('lists the Features with their Project and counts, the most recently changed first', () => {
    const board: Board = boardWith({
      readAt: NOW,
      projects: [
        project('alpha', [
          feature('Old work', ticketsIn(['done', 'ready'], 10)),
          feature('Rail page', ticketsIn(['done', 'done', 'ready', 'blocked', 'wontfix'], 2)),
        ]),
        project('beta', [feature('Camera fake', ticketsIn(['blocked', 'ready'], 5))]),
      ],
    });

    renderBoardView(board);

    expect(featureTitles()).toEqual(['Rail page', 'Camera fake', 'Old work']);
    const rail = featureRows()[0];
    expect(rail).toHaveTextContent('alpha');
    expect(rail).toHaveTextContent('2d ago');
    expect(rail).toHaveTextContent('1 ready');
    expect(rail).toHaveTextContent('1 blocked');
    expect(rail).toHaveTextContent('2/4 done');
    expect(screen.getByRole('region', { name: 'Features' })).toHaveTextContent('3 Features');
  });

  it("orders the Features by their last change, newest first, whatever their Tickets' times", () => {
    renderBoardView(boardWith({
      readAt: NOW,
      projects: [
        project('alpha', [
          feature('Old Tickets, new spec', ticketsIn(['ready'], 20), { updated: NOW - 1 * DAY }),
          feature('New Tickets, old files', ticketsIn(['ready'], 1), { updated: NOW - 9 * DAY }),
          feature('Spec only', [], { spec: '# Spec: Spec only\n', updated: NOW - 3 * DAY }),
        ]),
        project('beta', [feature('Issue only', [], { issue: '# Issue only\n', updated: NOW - 5 * DAY })]),
      ],
    }));

    expect(featureTitles()).toEqual(['Old Tickets, new spec', 'Spec only', 'Issue only', 'New Tickets, old files']);
    expect(featureRows()[0]).toHaveTextContent('24h ago');
    expect(featureRows()[1]).toHaveTextContent('3d ago');
  });

  it('shows the error on a Feature with a Ticket file that could not be read', () => {
    const broken: Feature = {
      ...feature('Rail page', ticketsIn(['ready'], 2)),
      error: "Couldn't read issues/02-b.md: EISDIR",
    };
    renderBoardView(boardWith({ readAt: NOW, projects: [project('alpha', [broken, feature('Other', ticketsIn(['ready'], 30))])] }));

    const [rail, other] = featureRows();
    expect(within(rail).getByText("Couldn't read issues/02-b.md: EISDIR")).toBeInTheDocument();
    expect(other).not.toHaveTextContent("Couldn't read");
  });

  it('marks a Feature that exists only in a worktree with a badge naming the worktree', () => {
    const inWorktree: Feature = { ...feature('Avoidable', ticketsIn(['ready'], 2)), worktree: 'review-2ec62d' };
    renderBoardView(boardWith({ readAt: NOW, projects: [project('alpha', [inWorktree, feature('Main', ticketsIn(['ready'], 30))])] }));

    const [avoidable, main] = featureRows();
    expect(within(avoidable).getByText('worktree review-2ec62d')).toBeInTheDocument();
    expect(main).not.toHaveTextContent('worktree');
  });

  it('shows what a Feature with no Tickets has so far, with no progress bar or counts', () => {
    renderBoardView(boardWith({
      readAt: NOW,
      projects: [
        project('alpha', [
          feature('With tickets', ticketsIn(['done', 'ready'], 2)),
          feature('Specified', [], { spec: '# Spec: Specified\n', issue: '# Specified\n' }),
          feature('Triaged', [], { issue: '# Triaged\n' }),
        ]),
      ],
    }));

    const [withTickets, specified, triaged] = featureRows();
    expect(within(withTickets).getByRole('progressbar')).toBeInTheDocument();
    expect(withTickets).toHaveTextContent('1/2 done');
    for (const [row, label] of [
      [specified, 'Spec, no tickets'],
      [triaged, 'Issue, no spec'],
    ] as const) {
      expect(row).toHaveTextContent(label);
      expect(within(row).queryByRole('progressbar')).toBeNull();
      expect(row).not.toHaveTextContent(/done|ready|blocked/);
    }
  });

  it('keeps the progress bar and counts for a Feature with no Tickets and neither a spec nor an issue', () => {
    renderBoardView(boardWith({ readAt: NOW, projects: [project('alpha', [feature('Empty issues folder', [])])] }));

    const [row] = featureRows();
    expect(within(row).getByRole('progressbar')).toBeInTheDocument();
    expect(row).toHaveTextContent('0/0 done');
    expect(row).not.toHaveTextContent(/no tickets|no spec/);
  });

  it('says so when there are no Features to show', () => {
    renderBoardView(boardWith({ readAt: NOW, projects: [project('alpha', [])] }));

    expect(featureRows()).toEqual([]);
    expect(screen.getByRole('region', { name: 'Features' })).toHaveTextContent('No Features');
  });
});

describe('BoardView: Project filter', () => {
  const board: Board = boardWith({
    readAt: NOW,
    projects: [
      project('alpha', [feature('Rail page', ticketsIn(['ready'], 2))]),
      project('beta', [feature('Camera fake', ticketsIn(['ready'], 5)), feature('Telemetry', ticketsIn(['blocked'], 7))]),
    ],
  });

  it('shows only the selected Project’s Features, and all of them again under All Projects', async () => {
    const user = userEvent.setup();
    renderBoardView(board);
    const sidebar = screen.getByRole('navigation', { name: 'Projects' });

    await user.click(within(sidebar).getByRole('button', { name: /^beta/ }));
    expect(featureTitles()).toEqual(['Camera fake', 'Telemetry']);

    await user.click(within(sidebar).getByRole('button', { name: /^All Projects/ }));
    expect(featureTitles()).toEqual(['Rail page', 'Camera fake', 'Telemetry']);
  });

  it('shows the Ready count of each Project, and of all Projects together', () => {
    renderBoardView(board);
    const sidebar = screen.getByRole('navigation', { name: 'Projects' });

    expect(within(sidebar).getByRole('button', { name: /^All Projects/ })).toHaveTextContent(/2$/);
    expect(within(sidebar).getByRole('button', { name: /^alpha/ })).toHaveTextContent(/1$/);
    expect(within(sidebar).getByRole('button', { name: /^beta/ })).toHaveTextContent(/1$/);
  });

  it('counts nothing in the Ready counts for a Feature with no Tickets', () => {
    const withoutTickets: Board = {
      ...board,
      projects: [
        project('alpha', [...board.projects[0].features, feature('Specified', [], { spec: '# Spec: Specified\n' })]),
        board.projects[1],
        project('gamma', [feature('Triaged', [], { issue: '# Triaged\n' })]),
      ],
    };

    renderBoardView(withoutTickets);
    const sidebar = screen.getByRole('navigation', { name: 'Projects' });

    expect(within(sidebar).getByRole('button', { name: /^All Projects/ })).toHaveTextContent(/2$/);
    expect(within(sidebar).getByRole('button', { name: /^alpha/ })).toHaveTextContent(/1$/);
    expect(within(sidebar).getByRole('button', { name: /^gamma/ })).not.toHaveTextContent(/\d$/);
  });
});

describe('BoardView: Hide finished', () => {
  const board: Board = boardWith({
    readAt: NOW,
    projects: [
      project('alpha', [
        feature('Live work', ticketsIn(['done', 'ready'], 2)),
        feature('Shipped', ticketsIn(['done', 'done', 'wontfix'], 3)),
        feature('Just written', []),
      ]),
    ],
  });

  it('hides Features whose Tickets are all Done or Won’t fix by default, and shows them when turned off', async () => {
    const user = userEvent.setup();
    renderBoardView(board);

    const hideFinished = screen.getByRole('checkbox', { name: 'Hide finished' });
    expect(hideFinished).toBeChecked();
    expect(featureTitles()).toEqual(['Live work', 'Just written']);

    await user.click(hideFinished);
    expect(featureTitles()).toEqual(['Live work', 'Shipped', 'Just written']);
  });

  it('hides a Feature with no Tickets once its own issue is closed, and keeps one whose issue is not', async () => {
    const user = userEvent.setup();
    renderBoardView(boardWith({
      readAt: NOW,
      projects: [
        project('alpha', [
          feature('Stopped work item', [], { issue: '# Stopped\n\nStatus: wontfix\n', closed: true, updated: NOW - DAY }),
          feature('Being specified', [], { spec: '# Spec: Being specified\n', updated: NOW - 2 * DAY }),
          feature('In triage', [], { issue: '# In triage\n', updated: NOW - 3 * DAY }),
        ]),
      ],
    }));

    expect(featureTitles()).toEqual(['Being specified', 'In triage']);

    await user.click(screen.getByRole('checkbox', { name: 'Hide finished' }));
    expect(featureTitles()).toEqual(['Stopped work item', 'Being specified', 'In triage']);
  });

  it("judges a Feature with Tickets by its Tickets alone, whatever its own issue says", () => {
    renderBoardView(boardWith({
      readAt: NOW,
      projects: [
        project('alpha', [
          feature('Issue closed, Ticket Ready', ticketsIn(['done', 'ready'], 2), { closed: true }),
          feature('Issue open, Tickets Done', ticketsIn(['done', 'wontfix'], 3), { closed: false }),
        ]),
      ],
    }));

    expect(featureTitles()).toEqual(['Issue closed, Ticket Ready']);
  });
});

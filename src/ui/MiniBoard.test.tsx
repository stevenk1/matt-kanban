// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { boardOf, DAY, feature, featurePane, NOW, project, renderBoardView, selectFeature, ticket } from './board-fixtures';

type ColumnName = 'Blocked' | 'Ready' | 'Your turn' | 'Done';

/** The cards in one mini-board column, top to bottom. */
function cardsIn(name: ColumnName) {
  return within(within(featurePane()).getByRole('region', { name })).queryAllByRole('button');
}

/** The numbers of the cards in one mini-board column, top to bottom. */
function column(name: ColumnName) {
  return cardsIn(name).map((card) => card.textContent?.match(/^\d+/)?.[0]);
}

describe('BoardView: Feature mini-board', () => {
  it('shows the selected Feature’s Tickets in Blocked, Ready and Done columns', async () => {
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'done'),
        ticket('02', 'ready'),
        ticket('03', 'blocked', { blockers: ['02'], openBlockers: ['02'] }),
        ticket('04', 'ready'),
      ]),
    );
    renderBoardView(board);
    expect(featurePane()).toHaveTextContent('Select a Feature');

    await selectFeature('Rail page');

    expect(within(featurePane()).getByRole('heading', { name: 'Rail page' })).toBeInTheDocument();
    expect(column('Blocked')).toEqual(['03']);
    expect(column('Ready')).toEqual(['02', '04']);
    expect(column('Done')).toEqual(['01']);
  });

  it('adds a Your turn column between Ready and Done, its cards noting the blockers not yet Done', async () => {
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'yourturn'),
        ticket('02', 'yourturn', { blockers: ['01'], openBlockers: ['01'] }),
        ticket('03', 'blocked', { blockers: ['01'], openBlockers: ['01'] }),
        ticket('04', 'done'),
      ]),
    );
    renderBoardView(board);
    await selectFeature('Rail page');

    const columns = within(featurePane()).getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(columns).toEqual(['Blocked', 'Ready', 'Your turn', 'Done']);
    expect(column('Your turn')).toEqual(['01', '02']);
    expect(column('Blocked')).toEqual(['03']);
    const [second] = cardsIn('Your turn').slice(1);
    expect(within(second).getByTitle('Blocked by')).toHaveTextContent('01');
  });

  it('shows no Your turn column for a Feature with no Your turn Tickets', async () => {
    renderBoardView(boardOf(feature('Rail page', [ticket('01', 'ready'), ticket('02', 'done')])));
    await selectFeature('Rail page');

    expect(within(featurePane()).queryByRole('region', { name: 'Your turn' })).toBeNull();
  });

  it('shows each card’s number, title, criteria progress, the numbers it waits on and a note marker', async () => {
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'ready', { title: 'Begin a sitting', criteria: { checked: 1, total: 3 } }),
        ticket('02', 'ready'),
        ticket('05', 'blocked', {
          title: 'End a sitting',
          blockers: ['01', '02'],
          openBlockers: ['01', '02'],
          blockerNote: '01, 02 and the spec review (see #12)',
        }),
      ]),
    );
    renderBoardView(board);
    await selectFeature('Rail page');

    const [begin, plain] = cardsIn('Ready');
    expect(begin).toHaveTextContent(/^01\s*Begin a sitting/);
    expect(begin).toHaveTextContent('1/3');
    expect(plain).not.toHaveTextContent('/');

    const [end] = cardsIn('Blocked');
    expect(end).toHaveTextContent(/^05\s*End a sitting/);
    expect(within(end).getByTitle('Blocked by')).toHaveTextContent('01, 02');
    expect(within(end).getByTitle('01, 02 and the spec review (see #12)')).toHaveTextContent('note');
    expect(within(begin).queryByTitle('Blocked by')).toBeNull();
    expect(begin).not.toHaveTextContent('note');
  });

  it('shows the worktree badge on every card of a Feature that lives only in a worktree', async () => {
    const board = boardOf(
      feature('Rail page', [ticket('01', 'ready'), ticket('02', 'done')], { worktree: 'agent-a1b2' }),
      feature('Main work', [ticket('01', 'ready')]),
    );
    renderBoardView(board);

    await selectFeature('Rail page');
    for (const card of [...cardsIn('Ready'), ...cardsIn('Done')]) {
      expect(within(card).getByTitle('agent-a1b2')).toHaveTextContent('worktree');
    }

    await selectFeature('Main work');
    expect(cardsIn('Ready')[0]).not.toHaveTextContent('worktree');
  });

  describe('the Done window', () => {
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'done', { updated: NOW - 40 * DAY }),
        ticket('02', 'done', { updated: NOW - 15 * DAY }),
        ticket('03', 'done', { updated: NOW - 14 * DAY }),
        ticket('04', 'done', { updated: NOW - 2 * DAY }),
        ticket('05', 'ready', { updated: NOW - 90 * DAY }),
      ]),
    );

    it('shows only the Tickets Done in the last 14 days, and all of them when "show all" is on', async () => {
      const user = userEvent.setup();
      renderBoardView(board);
      await selectFeature('Rail page');

      expect(column('Done')).toEqual(['03', '04']);
      expect(column('Ready')).toEqual(['05']);

      const showAll = within(featurePane()).getByRole('checkbox', { name: /Show all Done/ });
      expect(showAll).not.toBeChecked();
      await user.click(showAll);
      expect(column('Done')).toEqual(['01', '02', '03', '04']);
    });

    it('takes its length in days from the Board view', async () => {
      renderBoardView(board, { doneWindowDays: 3 });
      await selectFeature('Rail page');

      expect(column('Done')).toEqual(['04']);
    });
  });

  it('shows Won’t fix Tickets, marked as such, only when their toggle is on', async () => {
    const user = userEvent.setup();
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'done'),
        ticket('02', 'wontfix', { title: 'Dropped idea', updated: NOW - 60 * DAY }),
        ticket('03', 'ready'),
      ]),
    );
    renderBoardView(board);
    await selectFeature('Rail page');

    expect(featurePane()).not.toHaveTextContent('Dropped idea');
    expect([...column('Blocked'), ...column('Ready'), ...column('Done')]).toEqual(['03', '01']);

    const showWontFix = within(featurePane()).getByRole('checkbox', { name: /Show Won’t fix/ });
    expect(showWontFix).not.toBeChecked();
    await user.click(showWontFix);

    expect(column('Done')).toEqual(['01', '02']);
    expect(cardsIn('Done')[1]).toHaveTextContent('Won’t fix');

    await user.click(showWontFix);
    expect(featurePane()).not.toHaveTextContent('Dropped idea');
  });

  it('marks the selected Feature’s row', async () => {
    renderBoardView(boardOf(feature('Rail page', [ticket('01', 'ready')]), feature('Other', [])));
    await selectFeature('Rail page');

    const list = screen.getByRole('region', { name: 'Features' });
    expect(within(list).getByRole('button', { name: 'Rail page' })).toHaveAttribute('aria-current', 'true');
    expect(within(list).getByRole('button', { name: 'Other' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the selected Feature across a new Board, and shows the placeholder once it is gone', async () => {
    const before = boardOf(feature('Rail page', [ticket('01', 'ready')]), feature('Other', [ticket('01', 'ready')]));
    const { showBoard } = renderBoardView(before);
    await selectFeature('Rail page');

    showBoard(boardOf(feature('Rail page', [ticket('01', 'done')]), feature('Other', [])));
    expect(within(featurePane()).getByRole('heading', { name: 'Rail page' })).toBeInTheDocument();
    expect(column('Done')).toEqual(['01']);

    showBoard(boardOf(feature('Other', [ticket('01', 'ready')])));
    expect(featurePane()).toHaveTextContent(/^Select a Feature$/);
  });

  it('shows the placeholder when the selected Feature’s Project is filtered out', async () => {
    const user = userEvent.setup();
    const board = boardOf(feature('Rail page', [ticket('01', 'ready')]));
    renderBoardView({ ...board, projects: [...board.projects, project('beta')] });
    await selectFeature('Rail page');

    const sidebar = screen.getByRole('navigation', { name: 'Projects' });
    await user.click(within(sidebar).getByRole('button', { name: /^beta/ }));
    expect(featurePane()).toHaveTextContent(/^Select a Feature$/);

    await user.click(within(sidebar).getByRole('button', { name: /^alpha/ }));
    expect(within(featurePane()).getByRole('heading', { name: 'Rail page' })).toBeInTheDocument();
  });

  it('shows a status other than done, wontfix or ready-for-agent on the card, and marks an unknown one', async () => {
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'ready'),
        ticket('02', 'yourturn', { statusNote: 'needs a TV to test on' }),
        ticket('03', 'ready', { rawStatus: 'needs-info' }),
        ticket('04', 'ready', { rawStatus: 'in progress', unknownStatus: true }),
        ticket('05', 'ready', { rawStatus: '', unknownStatus: true }),
      ]),
    );
    renderBoardView(board);
    await selectFeature('Rail page');

    const [agent, info, odd, none] = cardsIn('Ready');
    const [human] = cardsIn('Your turn');
    expect(agent).not.toHaveTextContent(/ready-for|unknown status/);
    expect(within(human).getByTitle('needs a TV to test on')).toHaveTextContent('ready-for-human');
    expect(info).toHaveTextContent('needs-info');
    expect(within(odd).getByTitle('Status: in progress')).toHaveTextContent('unknown status');
    expect(within(none).getByTitle('No status')).toHaveTextContent('unknown status');
  });
});

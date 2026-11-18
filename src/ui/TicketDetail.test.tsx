// @vitest-environment jsdom
import { fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { boardOf, clickCard, DAY, feature, featurePane, NOW, renderBoardView, selectFeature, ticket } from './board-fixtures';

function detail() {
  return within(featurePane()).getByRole('article');
}

/** The rendered Ticket body in the detail. */
function renderedBody() {
  return within(detail()).getByRole('region', { name: 'Ticket' });
}

async function backToFeature() {
  await userEvent.setup().click(within(featurePane()).getByRole('button', { name: /Back to/ }));
}

describe('BoardView: Ticket detail', () => {
  it('opens a Ticket from its card, and back returns to the same Feature’s mini-board with its toggles kept', async () => {
    const user = userEvent.setup();
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'done', { updated: NOW - 40 * DAY }),
        ticket('02', 'ready', { title: 'Begin a sitting' }),
      ]),
    );
    renderBoardView(board);
    await selectFeature('Rail page');
    await user.click(within(featurePane()).getByRole('checkbox', { name: /Show all Done/ }));

    await clickCard('02');

    expect(within(detail()).getByRole('heading', { name: /02\s*Begin a sitting/ })).toBeInTheDocument();
    expect(within(detail()).getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('alpha › Rail page');
    expect(within(featurePane()).queryByRole('region', { name: 'Ready' })).toBeNull();

    await user.click(within(featurePane()).getByRole('button', { name: /Back to Rail page/ }));

    expect(within(featurePane()).getByRole('heading', { name: 'Rail page' })).toBeInTheDocument();
    expect(within(featurePane()).getByRole('checkbox', { name: /Show all Done/ })).toBeChecked();
    expect(within(within(featurePane()).getByRole('region', { name: 'Done' })).getByRole('button')).toHaveTextContent(
      /^01/,
    );
  });

  it('renders the body as markdown without its title line', async () => {
    const body = [
      '# 02: Begin a sitting',
      '',
      '**What to build:** the **first** step.',
      '',
      '## Acceptance criteria',
      '',
      '- [ ] It begins',
      '',
    ].join('\n');
    renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready', { title: 'Begin a sitting', body })])));
    await selectFeature('Rail page');
    await clickCard('02');

    expect(renderedBody()).not.toHaveTextContent('02: Begin a sitting');
    expect(within(renderedBody()).getByRole('heading', { name: 'Acceptance criteria' })).toBeInTheDocument();
    expect(within(renderedBody()).getAllByRole('strong').map((b) => b.textContent)).toEqual(['What to build:', 'first']);
    expect(within(renderedBody()).getByRole('listitem')).toHaveTextContent('It begins');
  });

  it('shows a GitHub Ticket’s body whole: its title is the issue’s own, not a line of the body', async () => {
    const body = '# Background\n\nThe rail is slow.\n';
    const github = ticket('7', 'ready', { body, location: { kind: 'url', url: 'https://github.com/me/alpha/issues/7' } });
    renderBoardView(boardOf(feature('Rail page', [github])));
    await selectFeature('Rail page');
    await clickCard('7');

    expect(within(renderedBody()).getByRole('heading', { name: 'Background' })).toBeInTheDocument();
    expect(renderedBody()).toHaveTextContent('The rail is slow.');
  });

  it('never runs raw HTML from a body', async () => {
    const body =
      '# 02: Begin\n\n<img src="x" onerror="window.hacked = true"><script>window.hacked = true</script>\n\n<a href="javascript:alert(1)">link</a>\n';
    renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready', { body })])));
    await selectFeature('Rail page');
    await clickCard('02');

    expect(renderedBody().querySelector('script')).toBeNull();
    expect(renderedBody().querySelector('[onerror]')).toBeNull();
    expect(renderedBody().querySelector('a')?.getAttribute('href') ?? '').not.toMatch(/^javascript:/);
  });

  it('keeps the window on the Board when a link in a body is clicked, showing its target on hover', async () => {
    const body = '# 02: Begin\n\nSee [the spec](../spec.md) and https://example.com/x.\n';
    renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready', { body })])));
    await selectFeature('Rail page');
    await clickCard('02');

    const spec = within(renderedBody()).getByRole('link', { name: 'the spec' });
    expect(spec).toHaveAttribute('title', '../spec.md');
    expect(fireEvent.click(spec)).toBe(false);
    expect(fireEvent.click(within(renderedBody()).getByRole('link', { name: 'https://example.com/x' }))).toBe(false);
  });

  describe('Show spec', () => {
    it('renders the Feature’s spec as markdown, and hides it again', async () => {
      const user = userEvent.setup();
      const spec = '# Spec: Rail page\n\n## Problem Statement\n\nThe rail is **slow**.\n';
      renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready')], { spec })));
      await selectFeature('Rail page');
      await clickCard('02');
      expect(within(detail()).queryByRole('region', { name: 'Spec' })).toBeNull();

      await user.click(within(detail()).getByRole('button', { name: 'Show spec' }));

      const shown = within(detail()).getByRole('region', { name: 'Spec' });
      expect(within(shown).getByRole('heading', { name: 'Problem Statement' })).toBeInTheDocument();
      expect(within(shown).getByRole('strong')).toHaveTextContent('slow');

      await user.click(within(detail()).getByRole('button', { name: 'Hide spec' }));
      expect(within(detail()).queryByRole('region', { name: 'Spec' })).toBeNull();
    });

    it('is absent when the Feature has no spec', async () => {
      renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready')], { spec: null })));
      await selectFeature('Rail page');
      await clickCard('02');

      expect(within(detail()).queryByRole('button', { name: /spec/i })).toBeNull();
    });
  });

  it('shows the state, criteria progress, the numbers it waits on and the "also waits on" note', async () => {
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'ready'),
        ticket('02', 'blocked', {
          criteria: { checked: 1, total: 3 },
          blockers: ['01'],
          openBlockers: ['01'],
          blockerNote: '01 and the spec review (see #12)',
        }),
      ]),
    );
    renderBoardView(board);
    await selectFeature('Rail page');
    await clickCard('02');

    expect(within(detail()).getByTitle('State')).toHaveTextContent('Blocked');
    expect(within(detail()).getByTitle('Acceptance criteria')).toHaveTextContent('1/3');
    expect(within(detail()).getByTitle('Blocked by')).toHaveTextContent('01');
    expect(within(detail()).getByText(/Also waits on/)).toHaveTextContent('Also waits on: 01 and the spec review (see #12)');
    expect(within(detail()).queryByText(/Status note/)).toBeNull();
  });

  it('shows the status note, and the marker the card shows for an unusual or unknown status', async () => {
    const board = boardOf(
      feature('Rail page', [
        ticket('01', 'done', { rawStatus: 'done (merged in #12)', statusNote: '(merged in #12)' }),
        ticket('02', 'ready', { rawStatus: 'needs-info' }),
        ticket('03', 'ready', { rawStatus: 'doneish', unknownStatus: true }),
      ]),
    );
    renderBoardView(board);
    await selectFeature('Rail page');

    await clickCard('01');
    expect(within(detail()).getByTitle('State')).toHaveTextContent('Done');
    expect(within(detail()).getByText(/Status note/)).toHaveTextContent('Status note: (merged in #12)');
    expect(within(detail()).queryByTitle('Acceptance criteria')).toBeNull();
    expect(within(detail()).queryByText(/Also waits on/)).toBeNull();

    await backToFeature();
    await clickCard('02');
    expect(within(detail()).getByTitle('State')).toHaveTextContent('Ready');
    expect(within(detail()).getByText('needs-info')).toBeInTheDocument();

    await backToFeature();
    await clickCard('03');
    expect(within(detail()).getByTitle('Status: doneish')).toHaveTextContent('unknown status');
  });

  describe('Open', () => {
    it('opens a local Ticket’s file in VS Code through a vscode://file/ URL', async () => {
      const user = userEvent.setup();
      const board = boardOf(
        feature('Rail page', [
          ticket('02', 'ready', { location: { kind: 'file', path: '/Users/me/repo/alpha/.scratch/rail-page/issues/02-a.md' } }),
          ticket('03', 'ready', { location: { kind: 'file', path: '/Users/me/repo/my notes/.scratch/x/issues/03-a#b.md' } }),
        ]),
      );
      const { opener } = renderBoardView(board);
      await selectFeature('Rail page');

      await clickCard('02');
      await user.click(within(detail()).getByRole('button', { name: 'Open in VS Code' }));
      expect(opener.openUrl).toHaveBeenLastCalledWith('vscode://file/Users/me/repo/alpha/.scratch/rail-page/issues/02-a.md');

      await backToFeature();
      await clickCard('03');
      await user.click(within(detail()).getByRole('button', { name: 'Open in VS Code' }));
      expect(opener.openUrl).toHaveBeenLastCalledWith('vscode://file/Users/me/repo/my%20notes/.scratch/x/issues/03-a%23b.md');
      expect(opener.openUrl).toHaveBeenCalledTimes(2);
    });

    it('opens a GitHub Ticket’s issue in the browser', async () => {
      const user = userEvent.setup();
      const issue = 'https://github.com/me/alpha/issues/7';
      const { opener } = renderBoardView(
        boardOf(feature('Rail page', [ticket('7', 'ready', { location: { kind: 'url', url: issue } })])),
      );
      await selectFeature('Rail page');
      await clickCard('7');

      expect(within(detail()).queryByRole('button', { name: 'Open in VS Code' })).toBeNull();
      await user.click(within(detail()).getByRole('button', { name: 'Open on GitHub' }));
      expect(opener.openUrl).toHaveBeenCalledExactlyOnceWith(issue);
    });
  });

  it('falls back to its Feature’s mini-board when a new Board no longer has the shown Ticket', async () => {
    const { showBoard } = renderBoardView(boardOf(feature('Rail page', [ticket('01', 'ready'), ticket('02', 'ready')])));
    await selectFeature('Rail page');
    await clickCard('02');
    expect(within(detail()).getByRole('heading', { name: /02/ })).toBeInTheDocument();

    showBoard(boardOf(feature('Rail page', [ticket('01', 'ready', { title: 'Begin a sitting' })])));

    expect(within(featurePane()).queryByRole('article')).toBeNull();
    expect(within(featurePane()).getByRole('heading', { name: 'Rail page' })).toBeInTheDocument();
    expect(within(within(featurePane()).getByRole('region', { name: 'Ready' })).getByRole('button')).toHaveTextContent(
      'Begin a sitting',
    );
  });

  it('keeps the shown Ticket, with its new content, when a new Board still has it', async () => {
    const { showBoard } = renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready')])));
    await selectFeature('Rail page');
    await clickCard('02');

    showBoard(boardOf(feature('Rail page', [ticket('02', 'done', { body: '# 02: x\n\nNow done.\n' })])));

    expect(within(detail()).getByTitle('State')).toHaveTextContent('Done');
    expect(renderedBody()).toHaveTextContent('Now done.');
  });

  it('closes the Ticket’s detail when a Feature is picked in the Feature list', async () => {
    renderBoardView(boardOf(feature('Rail page', [ticket('02', 'ready')]), feature('Main work', [ticket('01', 'ready')])));
    await selectFeature('Rail page');
    await clickCard('02');

    await selectFeature('Main work');
    expect(within(featurePane()).getByRole('heading', { name: 'Main work' })).toBeInTheDocument();

    await selectFeature('Rail page');
    expect(within(featurePane()).queryByRole('article')).toBeNull();
    expect(within(featurePane()).getByRole('heading', { name: 'Rail page' })).toBeInTheDocument();
  });
});

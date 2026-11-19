// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Board } from '../board/board';
import { NOW, feature, project, ticket, boardWith } from './board-fixtures';
import { ReadyPopover } from './ReadyPopover';

const board: Board = boardWith({
  readAt: NOW,
  projects: [
    project('alpha', [
      feature('Board reader', [
        ticket('01', 'ready', { title: 'Read a Feature' }),
        ticket('02', 'blocked', { title: 'Read GitHub' }),
        ticket('03', 'done', { title: 'Discover Projects' }),
      ]),
      feature('Menu bar', [ticket('01', 'ready', { title: 'Tray count' })]),
    ]),
    project('beta', [feature('Old work', [ticket('01', 'done'), ticket('02', 'wontfix')])]),
    project('gamma', [feature('Upgrade', [ticket('05', 'ready', { title: 'Bump Vite' })])]),
  ],
});

function renderPopover(b: Board, { openAtLogin = false as boolean | null } = {}) {
  const onReveal = vi.fn<(ticketId: string) => void>();
  const onOpenBoard = vi.fn<() => void>();
  const onOpenSettings = vi.fn<() => void>();
  const onOpenAtLoginChange = vi.fn<(on: boolean) => void>();
  const onQuit = vi.fn<() => void>();
  render(
    <ReadyPopover
      board={b}
      openAtLogin={openAtLogin}
      onReveal={onReveal}
      onOpenBoard={onOpenBoard}
      onOpenSettings={onOpenSettings}
      onOpenAtLoginChange={onOpenAtLoginChange}
      onQuit={onQuit}
    />,
  );
  return { onReveal, onOpenBoard, onOpenSettings, onOpenAtLoginChange, onQuit };
}

/** The Ready Tickets listed under a Project, as their text. */
function readyUnder(projectName: string) {
  const list = screen.getByRole('list', { name: projectName });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

describe('ReadyPopover', () => {
  it('lists the Ready Tickets grouped by Project, with their number and title', () => {
    renderPopover(board);

    expect(screen.getByRole('heading', { name: '3 Ready' })).toBeInTheDocument();
    expect(readyUnder('alpha')).toEqual(['01 Read a Feature', '01 Tray count']);
    expect(readyUnder('gamma')).toEqual(['05 Bump Vite']);
  });

  it('leaves out Projects with no Ready Tickets', () => {
    renderPopover(board);

    expect(screen.queryByRole('list', { name: 'beta' })).not.toBeInTheDocument();
  });

  it('counts nothing for a Feature with no Tickets', () => {
    const withoutTickets: Board = {
      ...board,
      projects: [
        ...board.projects,
        project('delta', [feature('Specified', [], { spec: '# Spec: Specified\n' }), feature('Triaged', [], { issue: '# Triaged\n' })]),
      ],
    };

    renderPopover(withoutTickets);

    expect(screen.getByRole('heading', { name: '3 Ready' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'delta' })).not.toBeInTheDocument();
  });

  it('reveals the clicked Ticket, telling apart same-numbered Tickets of different Features', async () => {
    const { onReveal, onOpenBoard } = renderPopover(board);

    const alpha = screen.getByRole('list', { name: 'alpha' });
    await userEvent.setup().click(within(alpha).getByRole('button', { name: '01 Tray count' }));

    expect(onReveal).toHaveBeenCalledExactlyOnceWith('alpha/menu-bar/01');
    expect(onOpenBoard).not.toHaveBeenCalled();
  });

  it('lists the Your turn Tickets grouped by Project above the Ready ones, and reveals the one clicked', async () => {
    const { onReveal } = renderPopover(boardWith({
      readAt: NOW,
      projects: [
        project('alpha', [
          feature('Runtime', [
            ticket('01', 'yourturn', { title: 'Bump runtime' }),
            ticket('02', 'ready', { title: 'Scan gate' }),
          ]),
        ]),
        project('beta', [feature('Release', [ticket('03', 'yourturn', { title: 'Upload build' })])]),
      ],
    }));

    const yourTurn = screen.getByRole('region', { name: 'Your turn' });
    const ready = screen.getByRole('region', { name: 'Ready' });
    expect(within(yourTurn).getByRole('heading', { name: '2 Your turn' })).toBeInTheDocument();
    expect(within(yourTurn).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '01 Bump runtime',
      '03 Upload build',
    ]);
    expect(within(ready).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['02 Scan gate']);
    expect(yourTurn.compareDocumentPosition(ready) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await userEvent.setup().click(within(yourTurn).getByRole('button', { name: '01 Bump runtime' }));
    expect(onReveal).toHaveBeenCalledExactlyOnceWith('alpha/runtime/01');
  });

  it('shows no Your turn group when no Ticket is Your turn', () => {
    renderPopover(board);

    expect(screen.queryByRole('region', { name: 'Your turn' })).not.toBeInTheDocument();
  });

  it('opens the Board window from "Open MattBoard…"', async () => {
    const { onReveal, onOpenBoard } = renderPopover(board);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Open MattBoard…' }));

    expect(onOpenBoard).toHaveBeenCalledOnce();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('ends with "Open MattBoard…", "Settings…", "Open at login" and "Quit MattBoard", in that order', () => {
    renderPopover(board);

    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons.slice(-4)).toEqual(['Open MattBoard…', 'Settings…', 'Open at login', 'Quit MattBoard']);
  });

  it('quits from "Quit MattBoard"', async () => {
    const { onReveal, onOpenBoard, onQuit } = renderPopover(board);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Quit MattBoard' }));

    expect(onQuit).toHaveBeenCalledOnce();
    expect(onOpenBoard).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('opens Settings from "Settings…"', async () => {
    const { onOpenSettings, onOpenBoard, onQuit } = renderPopover(board);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Settings…' }));

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onOpenBoard).not.toHaveBeenCalled();
    expect(onQuit).not.toHaveBeenCalled();
  });

  it('shows Open at login off, and turns it on', async () => {
    const { onOpenAtLoginChange } = renderPopover(board, { openAtLogin: false });

    const toggle = screen.getByRole('button', { name: 'Open at login', pressed: false });
    await userEvent.setup().click(toggle);

    expect(onOpenAtLoginChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('shows Open at login on, and turns it off', async () => {
    const { onOpenAtLoginChange } = renderPopover(board, { openAtLogin: true });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Open at login', pressed: true }));

    expect(onOpenAtLoginChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('offers no Open at login toggle to click until it is known whether it is on', async () => {
    const { onOpenAtLoginChange } = renderPopover(board, { openAtLogin: null });

    const toggle = screen.getByRole('button', { name: 'Open at login' });
    expect(toggle).toBeDisabled();
    await userEvent.setup().click(toggle);

    expect(onOpenAtLoginChange).not.toHaveBeenCalled();
  });

  it('says when nothing is Ready, and still offers "Open MattBoard…"', () => {
    renderPopover(boardWith({ readAt: NOW, projects: [project('beta', [feature('Old work', [ticket('01', 'done')])])] }));

    expect(screen.getByRole('heading', { name: 'Nothing Ready' })).toBeInTheDocument();
    expect(screen.queryAllByRole('list')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Open MattBoard…' })).toBeInTheDocument();
  });

  it('says no folders are picked yet, rather than nothing Ready, until a scan root is picked', () => {
    renderPopover({ readAt: NOW, scanRoots: [], projects: [] });

    expect(screen.getByRole('heading', { name: 'No folders picked' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open MattBoard…' })).toBeInTheDocument();
  });
});

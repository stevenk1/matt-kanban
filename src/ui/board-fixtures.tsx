// Hand-built Boards and Board-view helpers shared by the UI tests (seam 2). Not a test file
// itself: the tests import it.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';
import type { Board, Feature, Project, Ticket, TicketState } from '../board/board';
import { BoardView, type RevealRequest } from './BoardView';

export const DAY = 864e5;
/** When every fixture Board was read. */
export const NOW = Date.parse('2026-11-17T12:00:00Z');

/** A Ticket updated a day before NOW; its id is set when its Feature joins a Project. */
export function ticket(num: string, state: TicketState, extra: Partial<Ticket> = {}): Ticket {
  return {
    id: num,
    num,
    title: `Ticket ${num}`,
    state,
    rawStatus: state === 'done' || state === 'wontfix' ? state : 'ready-for-agent',
    statusNote: null,
    unknownStatus: false,
    blockers: [],
    openBlockers: [],
    blockerNote: null,
    criteria: { checked: 0, total: 0 },
    updated: NOW - DAY,
    location: { kind: 'file', path: `/x/${num}.md` },
    body: `# ${num}: Ticket ${num}\n\nBody of ${num}.\n`,
    ...extra,
  };
}

/** Tickets 01, 02, … in these states, the first updated `daysAgo` days before NOW, each next one a day earlier. */
export function ticketsIn(states: TicketState[], daysAgo: number): Ticket[] {
  return states.map((state, i) =>
    ticket(String(i + 1).padStart(2, '0'), state, { updated: NOW - (daysAgo + i) * DAY }),
  );
}

/**
 * A Feature, its slug taken from its title, not closed, and last changed when its newest Ticket was
 * (0 with no Tickets) unless `extra` says otherwise; its key is set when it joins a Project.
 */
export function feature(title: string, tickets: Ticket[], extra: Partial<Feature> = {}): Feature {
  const slug = title.toLowerCase().replace(/\W+/g, '-');
  const updated = Math.max(0, ...tickets.map((t) => t.updated));
  return { key: slug, slug, title, spec: null, issue: null, closed: false, updated, worktree: null, tickets, ...extra };
}

/** The scan root every fixture Project is under. */
export const SCAN_ROOT = '/Users/me/repo';

/** A local Project under SCAN_ROOT, keying its Features and Tickets the way the Board reader does. */
export function project(name: string, features: Feature[] = [], extra: Partial<Project> = {}): Project {
  return {
    name,
    dir: `${SCAN_ROOT}/${name}`,
    tracker: 'local',
    features: features.map((f) => {
      const key = `${name}/${f.slug}`;
      return { ...f, key, tickets: f.tickets.map((t) => ({ ...t, id: `${key}/${t.num}` })) };
    }),
    stories: [],
    ...extra,
  };
}

/** A Board read from SCAN_ROOT, with these fields. */
export function boardWith(fields: Omit<Board, 'scanRoots'>): Board {
  return { scanRoots: [SCAN_ROOT], ...fields };
}

/** A Board read at NOW with one Project, alpha, holding these Features. */
export function boardOf(...features: Feature[]): Board {
  return boardWith({ readAt: NOW, projects: [project('alpha', features)] });
}

/**
 * Renders the Board view with a stub opener, owned the way the app shell owns it. `showBoard`
 * re-renders it with a new Board, as a live update would; `reveal` asks it to reveal a Ticket, as
 * a click in the menu-bar popover would, and clears the request once the view has applied it;
 * `rebuild` mounts a fresh view, as the shell may; and `opener.openUrl` records what Open would
 * have opened.
 */
export function renderBoardView(board: Board, { doneWindowDays }: { doneWindowDays?: number } = {}) {
  const opener = { openUrl: vi.fn<(url: string) => void>() };
  const onAddFolder = vi.fn<() => void>();
  let requestReveal: (request: RevealRequest) => void = () => {};
  /** Holds the reveal request above the view, so a rebuilt view would see one still pending. */
  function Shell({ board, generation }: { board: Board; generation: number }) {
    const [reveal, setReveal] = useState<RevealRequest>();
    requestReveal = setReveal;
    return (
      <BoardView
        key={generation}
        board={board}
        doneWindowDays={doneWindowDays}
        opener={opener}
        reveal={reveal}
        onRevealed={() => setReveal(undefined)}
        onAddFolder={onAddFolder}
      />
    );
  }
  let shown = board;
  let generation = 0;
  const { rerender } = render(<Shell board={shown} generation={generation} />);
  return {
    opener,
    onAddFolder,
    showBoard: (next: Board) => {
      shown = next;
      rerender(<Shell board={shown} generation={generation} />);
    },
    reveal: (ticketId: string) => act(() => requestReveal({ ticketId })),
    rebuild: () => rerender(<Shell board={shown} generation={++generation} />),
  };
}

/** The right pane: the selected Feature's mini-board, or a Ticket's detail. */
export function featurePane() {
  return screen.getByRole('region', { name: 'Feature' });
}

/** Clicks a Feature in the Feature list. */
export async function selectFeature(title: string) {
  const list = screen.getByRole('region', { name: 'Features' });
  await userEvent.setup().click(within(list).getByRole('button', { name: title }));
}

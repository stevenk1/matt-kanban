// How many Tickets are in each state: what the sidebar's Ready counts, the Feature rows'
// progress bars and "Hide finished" are computed from. Also what a Feature with no Tickets
// shows in their place: its document.
import { isDoneOrWontFix, type Feature, type Project, type Ticket, type TicketState } from '../board/board';

export type StateCounts = Record<TicketState, number>;

export function countStates(tickets: Ticket[]): StateCounts {
  const counts: StateCounts = { blocked: 0, ready: 0, yourturn: 0, done: 0, wontfix: 0 };
  for (const ticket of tickets) counts[ticket.state]++;
  return counts;
}

/** What a progress bar and its "x/y done" count out of: Won't fix Tickets are left out. */
export function progressTotal(counts: StateCounts): number {
  return counts.done + counts.yourturn + counts.ready + counts.blocked;
}

/**
 * All the Feature's Tickets are Done or Won't fix, whatever its own issue says. A Feature with no
 * Tickets yet is finished once its own issue is closed.
 */
export function isFinished(feature: Feature): boolean {
  if (feature.tickets.length === 0) return feature.closed;
  return feature.tickets.every((ticket) => isDoneOrWontFix(ticket.state));
}

/** How many Tickets in these Projects are in this state: the Ready counts, and the popover's headings. */
export function countIn(projects: Project[], state: TicketState): number {
  return projects.reduce(
    (sum, project) => sum + project.features.reduce((n, f) => n + countStates(f.tickets)[state], 0),
    0,
  );
}

/** The document a Feature with no Tickets shows instead of a progress bar and mini-board. */
export type SpecOrIssue = { kind: 'spec' | 'issue'; markdown: string };

/**
 * A Feature with no Tickets shows its spec, else its issue. Null when it has Tickets, or has
 * neither (an empty `issues/` folder): those keep the progress bar and the mini-board.
 */
export function documentOf(feature: Feature): SpecOrIssue | null {
  if (feature.tickets.length > 0) return null;
  if (feature.spec !== null) return { kind: 'spec', markdown: feature.spec };
  if (feature.issue !== null) return { kind: 'issue', markdown: feature.issue };
  return null;
}

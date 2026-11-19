// The small facts about a Ticket that both its card and its detail show: its state's name,
// a status other than the usual ones, criteria progress, and the numbers it waits on.
import type { Ticket, TicketState } from '../board/board';
import './ticket-meta.css';

/** Each Ticket state's name, as the glossary spells it. */
export const STATE_LABELS: Record<TicketState, string> = {
  blocked: 'Blocked',
  ready: 'Ready',
  yourturn: 'Your turn',
  done: 'Done',
  wontfix: 'Won’t fix',
};

/** The statuses not worth mentioning: the Ticket's column or state badge already says them. */
const USUAL_STATUSES = ['done', 'wontfix', 'ready-for-agent'];

/** "unknown status" when the status matched no triage value, else any status but the usual ones. */
export function StatusMarker({ ticket }: { ticket: Ticket }) {
  if (ticket.unknownStatus) {
    return (
      <span className="status-marker" title={ticket.rawStatus ? `Status: ${ticket.rawStatus}` : 'No status'}>
        unknown status
      </span>
    );
  }
  if (USUAL_STATUSES.includes(ticket.rawStatus)) return null;
  return (
    <span className="status-marker" title={ticket.statusNote ?? undefined}>
      {ticket.rawStatus}
    </span>
  );
}

/** Checked of total acceptance criteria; nothing when the Ticket has none. */
export function CriteriaProgress({ ticket }: { ticket: Ticket }) {
  if (ticket.criteria.total === 0) return null;
  return (
    <span title="Acceptance criteria">
      ☑ {ticket.criteria.checked}/{ticket.criteria.total}
    </span>
  );
}

/** The numbers of the blockers that aren't Done yet; nothing when there are none. */
export function OpenBlockers({ ticket }: { ticket: Ticket }) {
  if (ticket.openBlockers.length === 0) return null;
  return <span title="Blocked by">⧗ {ticket.openBlockers.join(', ')}</span>;
}

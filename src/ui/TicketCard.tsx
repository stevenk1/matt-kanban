// One Ticket's card on the mini-board: its number, title, criteria progress, the numbers it
// waits on, a note marker when `Blocked by` had prose, a status other than the usual ones,
// and the worktree badge.
import type { Ticket } from '../board/board';
import { CriteriaProgress, OpenBlockers, STATE_LABELS, StatusMarker } from './TicketMeta';
import { WorktreeBadge } from './WorktreeBadge';

/** What every card on one mini-board shares. */
export type CardProps = {
  /** The worktree the Ticket's Feature lives only in, or null. */
  worktree: string | null;
  onOpen: (ticket: Ticket) => void;
};

export function TicketCard({ ticket, worktree, onOpen }: CardProps & { ticket: Ticket }) {
  return (
    <button type="button" className={`mini-card mini-card-${ticket.state}`} onClick={() => onOpen(ticket)}>
      <div className="mini-card-title">
        <span className="mini-card-num">{ticket.num}</span> {ticket.title}
      </div>
      <div className="mini-card-meta">
        {ticket.state === 'wontfix' && <span className="mini-card-wontfix-label">{STATE_LABELS.wontfix}</span>}
        <StatusMarker ticket={ticket} />
        <CriteriaProgress ticket={ticket} />
        <OpenBlockers ticket={ticket} />
        {ticket.blockerNote && <span title={ticket.blockerNote}>✎ note</span>}
        <WorktreeBadge worktree={worktree} />
      </div>
    </button>
  );
}

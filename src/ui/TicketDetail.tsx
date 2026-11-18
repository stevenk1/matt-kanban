// The right pane's other face in design C: one Ticket's detail, swapped in for its Feature's
// mini-board when a card is clicked. A back button swaps the mini-board back in.
import { useState } from 'react';
import type { Feature, Project, Ticket } from '../board/board';
import { Markdown } from './Markdown';
import type { Opener } from './opener';
import { CriteriaProgress, OpenBlockers, STATE_LABELS, StatusMarker } from './TicketMeta';
import './ticket-detail.css';

type Props = {
  project: Project;
  feature: Feature;
  ticket: Ticket;
  /** Returns to the Feature's mini-board. */
  onBack: () => void;
  opener: Opener;
};

export function TicketDetail({ project, feature, ticket, onBack, opener }: Props) {
  const [showSpec, setShowSpec] = useState(false);
  return (
    <article className="detail">
      <button type="button" className="detail-back" onClick={onBack} aria-label={`Back to ${feature.title}`}>
        ‹ {feature.title}
      </button>
      <nav className="detail-crumb" aria-label="Breadcrumb">
        {project.name} › {feature.title}
      </nav>
      <h2 className="detail-title">
        <span className="detail-num">{ticket.num}</span> {ticket.title}
      </h2>
      <div className="detail-meta">
        <span className={`detail-badge detail-badge-${ticket.state}`} title="State">
          {STATE_LABELS[ticket.state]}
        </span>
        <StatusMarker ticket={ticket} />
        <CriteriaProgress ticket={ticket} />
        <OpenBlockers ticket={ticket} />
      </div>
      {ticket.blockerNote && <p className="detail-note">Also waits on: {ticket.blockerNote}</p>}
      {ticket.statusNote && <p className="detail-note">Status note: {ticket.statusNote}</p>}
      <div className="detail-actions">
        <button type="button" className="detail-button detail-button-primary" onClick={() => opener.openUrl(ticketUrl(ticket))}>
          {ticket.location.kind === 'url' ? 'Open on GitHub' : 'Open in VS Code'}
        </button>
        {feature.spec !== null && (
          <button type="button" className="detail-button" aria-expanded={showSpec} onClick={() => setShowSpec(!showSpec)}>
            {showSpec ? 'Hide spec' : 'Show spec'}
          </button>
        )}
      </div>
      {showSpec && feature.spec !== null && <Markdown markdown={feature.spec} label="Spec" className="detail-spec" />}
      <Markdown markdown={withoutTitleLine(ticket)} label="Ticket" />
    </article>
  );
}

/**
 * The body without the `# ` line the Ticket's title was read from. A GitHub Ticket's title is
 * the issue's own, so its body is kept whole.
 */
function withoutTitleLine(ticket: Ticket): string {
  if (ticket.location.kind === 'url') return ticket.body;
  return ticket.body.replace(/^#[ \t]+.*(?:\r?\n|$)/m, '');
}

/** Where Open takes a Ticket: its file in VS Code, or its GitHub issue. */
function ticketUrl(ticket: Ticket): string {
  if (ticket.location.kind === 'url') return ticket.location.url;
  return `vscode://file${ticket.location.path.split('/').map(encodeURIComponent).join('/')}`;
}

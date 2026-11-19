// The menu-bar popover (seam 2): the Your turn Tickets grouped by Project when there are any,
// then the Ready ones the same way, then "Open MattBoard…",
// "Settings…", the "Open at login" toggle and "Quit MattBoard". It renders whatever Board value it
// is given; the shell shows it in a small window under the tray icon and acts on the clicks.
import { hasScanRoot, type Board, type Feature, type Project, type Ticket, type TicketState } from '../board/board';
import { countIn } from './ticket-counts';
import { STATE_LABELS } from './TicketMeta';
import './ready-popover.css';

type Props = {
  board: Board;
  /** Opens the Board window on this Ticket's detail. */
  onReveal: (ticketId: string) => void;
  /** Brings the Board window forward. */
  onOpenBoard: () => void;
  /** Opens the Settings window. */
  onOpenSettings: () => void;
  /** Whether the app opens at login; null until that is known. */
  openAtLogin: boolean | null;
  /** Turns Open at login on or off. */
  onOpenAtLoginChange: (on: boolean) => void;
  /** Quits the app: closing the Board window only hides it. */
  onQuit: () => void;
};

type ListedTicket = { feature: Feature; ticket: Ticket };
type ProjectGroup = { project: Project; tickets: ListedTicket[] };

export function ReadyPopover({
  board,
  onReveal,
  onOpenBoard,
  onOpenSettings,
  openAtLogin,
  onOpenAtLoginChange,
  onQuit,
}: Props) {
  const total = countIn(board.projects, 'ready');
  let heading = `${total} Ready`;
  if (!hasScanRoot(board)) heading = 'No folders picked';
  else if (total === 0) heading = 'Nothing Ready';

  const yourTurn = byProject(board.projects, 'yourturn');

  return (
    <div className="popover">
      {yourTurn.length > 0 && (
        <TicketSection
          state="yourturn"
          heading={`${countIn(board.projects, 'yourturn')} ${STATE_LABELS.yourturn}`}
          groups={yourTurn}
          onReveal={onReveal}
        />
      )}
      <TicketSection state="ready" heading={heading} groups={byProject(board.projects, 'ready')} onReveal={onReveal} />
      <hr className="pop-sep" />
      <button type="button" className="pop-item" onClick={onOpenBoard}>
        Open MattBoard…
      </button>
      <button type="button" className="pop-item" onClick={onOpenSettings}>
        Settings…
      </button>
      {/* A menu's checkmark item: the stylesheet draws the checkmark from aria-pressed. */}
      <button
        type="button"
        className="pop-item pop-check"
        aria-pressed={openAtLogin ?? false}
        disabled={openAtLogin === null}
        onClick={() => openAtLogin !== null && onOpenAtLoginChange(!openAtLogin)}
      >
        Open at login
      </button>
      <hr className="pop-sep" />
      <button type="button" className="pop-item" onClick={onQuit}>
        Quit MattBoard
      </button>
    </div>
  );
}

type SectionProps = {
  state: 'ready' | 'yourturn';
  heading: string;
  groups: ProjectGroup[];
  onReveal: (ticketId: string) => void;
};

/** A heading with the state's dot, then the state's Tickets under each Project. */
function TicketSection({ state, heading, groups, onReveal }: SectionProps) {
  return (
    <section aria-label={STATE_LABELS[state]}>
      <h2 className="pop-head">
        <span className={`pop-dot pop-dot-${state}`} aria-hidden="true" />
        {heading}
      </h2>
      {groups.map(({ project, tickets }) => (
        <section key={project.dir} className="pop-group">
          <h3 className="pop-project">{project.name}</h3>
          <ul aria-label={project.name}>
            {tickets.map(({ feature, ticket }) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  className="pop-item"
                  title={`${feature.title}: ${ticket.num} ${ticket.title}`}
                  onClick={() => onReveal(ticket.id)}
                >
                  <span className="pop-num">{ticket.num}</span> {ticket.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}

/** Each Project that has Tickets in this state, in Board order, with those Tickets in Feature order. */
function byProject(projects: Project[], state: TicketState): ProjectGroup[] {
  return projects
    .map((project) => ({
      project,
      tickets: project.features.flatMap((feature) =>
        feature.tickets.filter((ticket) => ticket.state === state).map((ticket) => ({ feature, ticket })),
      ),
    }))
    .filter((group) => group.tickets.length > 0);
}

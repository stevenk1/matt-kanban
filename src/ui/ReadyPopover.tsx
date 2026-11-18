// The menu-bar popover (seam 2): the Ready Tickets grouped by Project, then "Open Board…",
// "Settings…", the "Open at login" toggle and "Quit MattBoard". It renders whatever Board value it
// is given; the shell shows it in a small window under the tray icon and acts on the clicks.
import { hasScanRoot, type Board, type Feature, type Project, type Ticket } from '../board/board';
import { readyCount } from './ticket-counts';
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

type ReadyTicket = { feature: Feature; ticket: Ticket };
type ProjectGroup = { project: Project; tickets: ReadyTicket[] };

export function ReadyPopover({
  board,
  onReveal,
  onOpenBoard,
  onOpenSettings,
  openAtLogin,
  onOpenAtLoginChange,
  onQuit,
}: Props) {
  const total = readyCount(board.projects);
  let heading = `${total} Ready`;
  if (!hasScanRoot(board)) heading = 'No folders picked';
  else if (total === 0) heading = 'Nothing Ready';

  return (
    <div className="popover">
      <h2 className="pop-head">
        <span className="pop-dot" aria-hidden="true" />
        {heading}
      </h2>
      {readyByProject(board.projects).map(({ project, tickets }) => (
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
      <hr className="pop-sep" />
      <button type="button" className="pop-item" onClick={onOpenBoard}>
        Open Board…
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

/** Each Project that has Ready Tickets, in Board order, with its Ready Tickets in Feature order. */
function readyByProject(projects: Project[]): ProjectGroup[] {
  return projects
    .map((project) => ({
      project,
      tickets: project.features.flatMap((feature) =>
        feature.tickets.filter((ticket) => ticket.state === 'ready').map((ticket) => ({ feature, ticket })),
      ),
    }))
    .filter((group) => group.tickets.length > 0);
}

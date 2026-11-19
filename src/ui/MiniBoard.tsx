// The right pane of design C: the selected Feature's own board, its Tickets in Blocked,
// Ready and Done columns, with a Your turn column before Done when it has any. Done shows only the Tickets Done within the Done window unless
// "Show all Done" is on; Won't fix Tickets join it only when "Show Won't fix" is on.
import type { Feature, Project, Ticket, TicketState } from '../board/board';
import { TicketCard, type CardProps } from './TicketCard';
import { STATE_LABELS } from './TicketMeta';
import './mini-board.css';

const DAY = 24 * 60 * 60 * 1000;

/** The mini-board's toggles. The Board view keeps them, so they outlive this pane. */
export type MiniBoardToggles = { showAllDone: boolean; showWontFix: boolean };

type Props = {
  project: Project;
  feature: Feature;
  /** The time the Done window is measured back from: when the Board was read. */
  now: number;
  /** How many days a Done Ticket stays in the Done column. */
  doneWindowDays: number;
  toggles: MiniBoardToggles;
  onToggle: (toggles: MiniBoardToggles) => void;
  /** Called when a card is clicked. */
  onOpen: (ticket: Ticket) => void;
};

export function MiniBoard({ project, feature, now, doneWindowDays, toggles, onToggle, onOpen }: Props) {
  const inWindow = (t: Ticket) => now - t.updated <= doneWindowDays * DAY;
  const olderDone = feature.tickets.filter((t) => t.state === 'done' && !inWindow(t)).length;
  const shownDone = feature.tickets.filter(
    (t) =>
      (t.state === 'done' && (toggles.showAllDone || inWindow(t))) || (t.state === 'wontfix' && toggles.showWontFix),
  );
  const yourTurn = feature.tickets.filter((t) => t.state === 'yourturn');
  const cardProps: CardProps = { worktree: feature.worktree, onOpen };

  return (
    <div className="mini-board">
      <header className="mini-board-head">
        <div>
          <h2 className="mini-board-title">{feature.title}</h2>
          <div className="mini-board-project">{project.name}</div>
        </div>
        <div className="mini-board-toggles">
          <label>
            <input
              type="checkbox"
              checked={toggles.showAllDone}
              onChange={(e) => onToggle({ ...toggles, showAllDone: e.target.checked })}
            />
            Show all Done
          </label>
          <label>
            <input
              type="checkbox"
              checked={toggles.showWontFix}
              onChange={(e) => onToggle({ ...toggles, showWontFix: e.target.checked })}
            />
            Show Won’t fix
          </label>
        </div>
      </header>
      <div className="mini-columns">
        <Column state="blocked" tickets={feature.tickets.filter((t) => t.state === 'blocked')} {...cardProps} />
        <Column state="ready" tickets={feature.tickets.filter((t) => t.state === 'ready')} {...cardProps} />
        {yourTurn.length > 0 && <Column state="yourturn" tickets={yourTurn} {...cardProps} />}
        <Column
          state="done"
          tickets={shownDone}
          footer={olderDone > 0 && !toggles.showAllDone ? `${olderDone} older than ${doneWindowDays} days` : null}
          {...cardProps}
        />
      </div>
    </div>
  );
}

type ColumnProps = CardProps & {
  /** The state the column holds; Won't fix Tickets join Done when shown. */
  state: Exclude<TicketState, 'wontfix'>;
  tickets: Ticket[];
  footer?: string | null;
};

function Column({ state, tickets, footer, ...cardProps }: ColumnProps) {
  const label = STATE_LABELS[state];
  return (
    <section className="mini-column" aria-label={label}>
      <h3 className="mini-column-head">
        <span className={`mini-dot mini-dot-${state}`} aria-hidden="true" />
        {label}
        <span className="mini-column-count">{tickets.length}</span>
      </h3>
      {tickets.length === 0 ? (
        <p className="mini-column-empty">None</p>
      ) : (
        <ul className="mini-cards">
          {tickets.map((t) => (
            <li key={t.id}>
              <TicketCard ticket={t} {...cardProps} />
            </li>
          ))}
        </ul>
      )}
      {footer && <p className="mini-column-footer">{footer}</p>}
    </section>
  );
}

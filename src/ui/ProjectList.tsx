// The sidebar's Project list: All Projects, then each Project with its tracker type and
// Ready count. Selecting one filters the rest of the Board to it.
import type { ReactNode } from 'react';
import type { Project, Tracker } from '../board/board';
import { readyCount } from './ticket-counts';
import './project-list.css';

type Props = {
  projects: Project[];
  /** The selected Project's folder, or null for All Projects. */
  selected: string | null;
  onSelect: (dir: string | null) => void;
};

export function ProjectList({ projects, selected, onSelect }: Props) {
  return (
    <ul className="side-list">
      <li>
        <SideButton selected={selected === null} onClick={() => onSelect(null)}>
          <div className="side-row">
            <span className="side-name">All Projects</span>
            <ReadyCount count={readyCount(projects)} />
          </div>
        </SideButton>
      </li>
      {projects.map((project) => (
        <li key={project.dir} title={project.dir}>
          <SideButton selected={selected === project.dir} onClick={() => onSelect(project.dir)}>
            <div className="side-row">
              <span className="side-name">{project.name}</span>
              <TrackerBadge tracker={project.tracker} />
              <ReadyCount count={readyCount([project])} />
            </div>
            {project.error && <div className="side-error">{project.error}</div>}
          </SideButton>
        </li>
      ))}
    </ul>
  );
}

function SideButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`side-item${selected ? ' selected' : ''}`}
      aria-current={selected || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** The Project's Ready Tickets; blank when there are none. */
function ReadyCount({ count }: { count: number }) {
  return <span className="side-count">{count > 0 ? count : ''}</span>;
}

const TRACKER_LABEL: Record<Tracker, string> = { local: 'local', github: 'GitHub' };

function TrackerBadge({ tracker }: { tracker: Tracker }) {
  return <span className={`tracker tracker-${tracker}`}>{TRACKER_LABEL[tracker]}</span>;
}

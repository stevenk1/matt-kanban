// The middle pane of design C: the Features of the given Projects, the most recently
// changed first (by `Feature.updated`), each with a stacked done/ready/blocked progress bar and its counts, or,
// for a Feature with no Tickets yet, what it has so far ("Spec, no tickets").
// "Hide finished" (on by default) hides Features whose Tickets are all Done or Won't fix, and
// Features with no Tickets whose own issue is closed.
import { useState } from 'react';
import type { Feature, Project } from '../board/board';
import { countStates, documentOf, isFinished, progressTotal, type StateCounts } from './ticket-counts';
import { WorktreeBadge } from './WorktreeBadge';
import './feature-list.css';

type Props = {
  projects: Project[];
  /** The time "2d ago" is measured from: when the Board was read. */
  now: number;
  /** The selected Feature's key, or null. */
  selected: string | null;
  /**
   * Keys the rows for the Project-switch fade: a new value inserts them anew, so they fade in.
   * BoardView passes the picked Project, so a new Board alone never plays it.
   */
  rowsKey: string | null;
  onSelect: (key: string) => void;
};

type Row = { project: Project; feature: Feature; counts: StateCounts };

export function FeatureList({ projects, now, selected, rowsKey, onSelect }: Props) {
  const [hideFinished, setHideFinished] = useState(true);

  const rows = projects
    .flatMap((project) => project.features.map((feature) => rowOf(project, feature)))
    .filter((row) => !hideFinished || !isFinished(row.feature))
    .sort((a, b) => b.feature.updated - a.feature.updated);

  return (
    <section className="feature-list" aria-label="Features">
      <header className="pane-head feature-list-head">
        <span>{rows.length === 1 ? '1 Feature' : `${rows.length} Features`}</span>
        <label className="hide-finished">
          <input type="checkbox" checked={hideFinished} onChange={(e) => setHideFinished(e.target.checked)} />
          Hide finished
        </label>
      </header>
      {rows.length === 0 && <p className="empty">No Features</p>}
      {/* Kept while empty, so the first Features a new Board brings don't insert it and fade it in. */}
      <ul key={rowsKey} className="features">
        {rows.map((row) => (
          <FeatureRow
            key={`${row.project.dir}/${row.feature.key}`}
            row={row}
            now={now}
            selected={row.feature.key === selected}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  );
}

function rowOf(project: Project, feature: Feature): Row {
  return { project, feature, counts: countStates(feature.tickets) };
}

type RowProps = { row: Row; now: number; selected: boolean; onSelect: (key: string) => void };

function FeatureRow({ row, now, selected, onSelect }: RowProps) {
  const { project, feature, counts } = row;
  const total = progressTotal(counts);
  const specOrIssue = documentOf(feature);
  return (
    <li className={`feature-row${selected ? ' selected' : ''}`}>
      <div className="feature-row-top">
        <h3 className="feature-title" title={feature.title}>
          {/* Stretched over the whole row by CSS, so the row is one click target. */}
          <button
            type="button"
            className="feature-select"
            aria-current={selected || undefined}
            onClick={() => onSelect(feature.key)}
          >
            {feature.title}
          </button>
        </h3>
        {/* 0: none of its files to date it by (an empty issues/ folder). */}
        {feature.updated > 0 && <span className="feature-changed">{ago(feature.updated, now)}</span>}
      </div>
      <div className="feature-project">
        {project.name} <WorktreeBadge worktree={feature.worktree} />
      </div>
      {specOrIssue ? (
        // A Feature with no Tickets yet says what it has so far: an empty bar would look like stalled work.
        <div className="feature-no-tickets">{specOrIssue.kind === 'spec' ? 'Spec, no tickets' : 'Issue, no spec'}</div>
      ) : (
        <>
          <ProgressBar counts={counts} total={total} />
          <div className="feature-counts">
            {counts.ready > 0 && <span className="count-ready">{counts.ready} ready</span>}
            {counts.blocked > 0 && <span className="count-blocked">{counts.blocked} blocked</span>}
            <span className="count-done">
              {counts.done}/{total} done
            </span>
          </div>
        </>
      )}
      {feature.error && <div className="feature-error">{feature.error}</div>}
    </li>
  );
}

function ProgressBar({ counts, total }: { counts: StateCounts; total: number }) {
  const width = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%`;
  return (
    <div
      className="bar"
      role="progressbar"
      aria-label="Tickets done"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={counts.done}
    >
      <span className="bar-done" style={{ width: width(counts.done) }} />
      <span className="bar-ready" style={{ width: width(counts.ready) }} />
      <span className="bar-blocked" style={{ width: width(counts.blocked) }} />
    </div>
  );
}

function ago(then: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

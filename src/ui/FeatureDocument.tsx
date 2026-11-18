// The right pane for a Feature with no Tickets yet, in place of its mini-board: the Feature's
// spec rendered, or its issue when it has no spec, so where the work stands can be read on
// the Board.
import type { Feature, Project } from '../board/board';
import { Markdown } from './Markdown';
import type { SpecOrIssue } from './ticket-counts';
import './feature-document.css';

type Props = {
  project: Project;
  feature: Feature;
  /** What the Feature has so far, from `documentOf`. */
  specOrIssue: SpecOrIssue;
};

export function FeatureDocument({ project, feature, specOrIssue }: Props) {
  return (
    <div className="feature-document">
      <header>
        <h2 className="feature-document-title">{feature.title}</h2>
        <div className="feature-document-project">{project.name}</div>
      </header>
      <Markdown
        markdown={specOrIssue.markdown}
        label={specOrIssue.kind === 'spec' ? 'Spec' : 'Issue'}
        className="feature-document-body"
      />
    </div>
  );
}

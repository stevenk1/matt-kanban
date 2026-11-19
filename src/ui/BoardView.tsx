// The Board view (seam 2): design C, "Feature navigator". A Mail.app-style window with
// three panes: the Project sidebar, the Feature list, and the selected Feature's pane.
// It renders whatever Board value it is given; it never reads disk itself.
import { useEffect, useState, type ReactNode } from 'react';
import { hasScanRoot, keepsStories, type Board, type Feature, type Project } from '../board/board';
import { FeatureDocument } from './FeatureDocument';
import { FeatureList } from './FeatureList';
import { MiniBoard, type MiniBoardToggles } from './MiniBoard';
import type { Opener } from './opener';
import { ProjectList } from './ProjectList';
import { StoryList } from './StoryList';
import { documentOf } from './ticket-counts';
import { TicketDetail } from './TicketDetail';
import './board-view.css';

/** A request to show one Ticket's detail; each new request object asks again, even for the same Ticket. */
export type RevealRequest = { ticketId: string };

/**
 * How the Feature pane's view was last reached, which picks its enter animation: a Ticket opened
 * slides in from the right, Back slides the Feature in from the left, another Project or Feature
 * fades in. `count` keys the view, so each navigation inserts it anew and its animation plays,
 * while a new Board alone keeps the same view and never replays it.
 */
type Navigation = { count: number; kind: 'open' | 'back' | 'switch' | null };

export type BoardViewProps = {
  board: Board;
  /** How many days a Done Ticket stays on the mini-board before "Show all Done" is needed. */
  doneWindowDays?: number;
  /** Opens a Ticket outside the app, in VS Code or the browser. */
  opener: Opener;
  /** Selects this Ticket's Project and Feature and opens its detail, as the menu-bar popover asks. */
  reveal?: RevealRequest;
  /**
   * Called once `reveal` has been applied. The owner clears `reveal` then, so a rebuilt view never
   * applies it again.
   */
  onRevealed?: () => void;
  /** Asks for a folder to add as a scan root, while there is none yet. */
  onAddFolder: () => void;
};

export function BoardView({ board, doneWindowDays = 14, opener, reveal, onRevealed, onAddFolder }: BoardViewProps) {
  /** The selected Project's folder, or null for All Projects. */
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  /** The selected Feature's key, or null. */
  const [selectedFeatureKey, setSelectedFeatureKey] = useState<string | null>(null);
  /** The id of the Ticket whose detail shows, or null while the Feature's mini-board shows. */
  const [detailTicketId, setDetailTicketId] = useState<string | null>(null);
  const [navigation, setNavigation] = useState<Navigation>({ count: 0, kind: null });
  const [miniBoardToggles, setMiniBoardToggles] = useState<MiniBoardToggles>({
    showAllDone: false,
    showWontFix: false,
  });
  // The routes through the Board: each changes the selection and picks the pane's enter animation
  // together, so none can forget the one or the other.
  const navigate = (kind: Navigation['kind']) => setNavigation((last) => ({ count: last.count + 1, kind }));
  const openTicket = (ticketId: string) => {
    setDetailTicketId(ticketId);
    navigate('open');
  };
  const goBack = () => {
    setDetailTicketId(null);
    navigate('back');
  };
  const switchToProject = (dir: string | null) => {
    setSelectedProject(dir);
    navigate('switch');
  };
  const switchToFeature = (key: string) => {
    setSelectedFeatureKey(key);
    setDetailTicketId(null);
    navigate('switch');
  };
  // Applies each new request once. A new Board alone doesn't apply it again, so this runs only
  // when the request changes.
  useEffect(() => {
    if (!reveal) return;
    const found = findFeatureWhere(board.projects, (f) => f.tickets.some((t) => t.id === reveal.ticketId));
    if (found) {
      setSelectedProject(found.project.dir);
      setSelectedFeatureKey(found.feature.key);
      openTicket(reveal.ticketId);
    }
    onRevealed?.();
  }, [reveal]);
  if (!hasScanRoot(board)) return <NoScanRoot onAddFolder={onAddFolder} />;
  const shownProjects =
    selectedProject === null ? board.projects : board.projects.filter((p) => p.dir === selectedProject);
  const selection = findFeatureWhere(shownProjects, (f) => f.key === selectedFeatureKey);
  // A Ticket that is no longer in its Feature falls back to the Feature's mini-board.
  const detailTicket = selection?.feature.tickets.find((t) => t.id === detailTicketId) ?? null;
  const specOrIssue = selection && documentOf(selection.feature);

  return (
    <div className="board">
      <Sidebar projects={board.projects} selectedProject={selectedProject} onSelectProject={switchToProject}>
        {keepsStories(board) && <StoryList projects={shownProjects} />}
      </Sidebar>
      <FeatureList
        projects={shownProjects}
        now={board.readAt}
        selected={selection?.feature.key ?? null}
        rowsKey={selectedProject}
        onSelect={switchToFeature}
      />
      <section className="feature-pane" aria-label="Feature">
        <div
          key={navigation.count}
          className={`feature-pane-view${navigation.kind ? ` feature-pane-view-${navigation.kind}` : ''}`}
        >
          {selection && detailTicket ? (
            <TicketDetail
              key={detailTicket.id}
              project={selection.project}
              feature={selection.feature}
              ticket={detailTicket}
              onBack={goBack}
              opener={opener}
            />
          ) : selection && specOrIssue ? (
            <FeatureDocument project={selection.project} feature={selection.feature} specOrIssue={specOrIssue} />
          ) : selection ? (
            <MiniBoard
              project={selection.project}
              feature={selection.feature}
              now={board.readAt}
              doneWindowDays={doneWindowDays}
              toggles={miniBoardToggles}
              onToggle={setMiniBoardToggles}
              onOpen={(ticket) => openTicket(ticket.id)}
            />
          ) : (
            <p className="empty">Select a Feature</p>
          )}
        </div>
      </section>
    </div>
  );
}

/** The whole window while no folder has been picked to read: one line and Add Folder. */
function NoScanRoot({ onAddFolder }: { onAddFolder: () => void }) {
  return (
    <main className="board-no-scan-root">
      <h1>Pick the folder that holds your projects</h1>
      <p>Every folder in it with docs/agents/issue-tracker.md shows in MattBoard. You can add more in Settings.</p>
      <button type="button" onClick={onAddFolder}>
        Add Folder…
      </button>
    </main>
  );
}

type SidebarProps = {
  projects: Project[];
  selectedProject: string | null;
  onSelectProject: (dir: string | null) => void;
  children: ReactNode;
};

function Sidebar({ projects, selectedProject, onSelectProject, children }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Projects">
      <div className="side-label">Projects</div>
      <ProjectList projects={projects} selected={selectedProject} onSelect={onSelectProject} />
      {projects.length === 0 && <p className="empty">No Projects found</p>}
      {children}
    </nav>
  );
}

/** The first Feature among these Projects that passes `test`, with its Project; null when none does. */
function findFeatureWhere(projects: Project[], test: (feature: Feature) => boolean) {
  for (const project of projects) {
    const feature = project.features.find(test);
    if (feature) return { project, feature };
  }
  return null;
}

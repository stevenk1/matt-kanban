// The Board value: everything the Board UI shows, as returned by the Board reader.
// Shape from the spec's Implementation Decisions, "Board value".

/** `yourturn` is Your turn: a `ready-for-human` Ticket, whose next step is the developer's. */
export type TicketState = 'blocked' | 'ready' | 'yourturn' | 'done' | 'wontfix';

/** Done or Won't fix: the Ticket waits on nothing and nothing waits on it. */
export function isDoneOrWontFix(state: TicketState): boolean {
  return state === 'done' || state === 'wontfix';
}

export type Tracker = 'local' | 'github';

export type Board = {
  readAt: number;
  /** The folders it was read from; none until the user picks one. */
  scanRoots: string[];
  projects: Project[];
};

/** Whether the user has picked a folder for the Board to be read from. */
export function hasScanRoot(board: Board): boolean {
  return board.scanRoots.length > 0;
}

/** Whether any Project on the Board keeps Stories, which are optional. */
export function keepsStories(board: Board): boolean {
  return board.projects.some((project) => project.stories.length > 0);
}

export type Project = {
  name: string;
  dir: string;
  tracker: Tracker;
  error?: string;
  features: Feature[];
  stories: Story[];
};

export type Feature = {
  key: string;
  slug: string;
  title: string;
  spec: string | null;
  /** The text of a local Feature's `issue.md`; null without one, and on GitHub, where the Feature issue's body is `spec`. */
  issue: string | null;
  /**
   * The Feature's own issue is over: a local `issue.md` whose first Status is `done` or `wontfix`,
   * or a closed GitHub Spec issue. False without an issue.
   */
  closed: boolean;
  /**
   * Epoch milliseconds of the newest change among the Feature's Ticket files, `spec.md` and
   * `issue.md`; on GitHub, the newest `updatedAt` of the Spec issue and its sub-issues. 0 when it
   * has none of those (an empty `issues/` folder).
   */
  updated: number;
  worktree: string | null;
  url?: string;
  /** Empty for a Feature with no Tickets yet: it has only a spec or an issue. */
  tickets: Ticket[];
  /** Names the Ticket files that couldn't be read; the readable ones are still in `tickets`. */
  error?: string;
};

export type Ticket = {
  id: string;
  num: string;
  title: string;
  state: TicketState;
  rawStatus: string;
  statusNote: string | null;
  unknownStatus: boolean;
  blockers: string[];
  openBlockers: string[];
  blockerNote: string | null;
  criteria: { checked: number; total: number };
  updated: number;
  location: { kind: 'file'; path: string } | { kind: 'url'; url: string };
  body: string;
};

export type Story = {
  slug: string;
  goal: string;
  status: string;
  waiting: string | null;
  /** The skill from `Waiting: in-step:<skill>`; null when the Story isn't mid-step. */
  step: string | null;
  recommended: string | null;
  lastLog: string | null;
  updated: number;
  worktree: string | null;
};

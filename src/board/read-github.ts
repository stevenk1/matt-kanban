// The GitHub Features of one GitHub Project, read through the GitHub port. Part of the
// Board reader (seam 1); tested through `readBoard`. Grouping follows the spec's
// Implementation Decisions ("GitHub port"); the shared Ticket parsing and state are in
// `ticket-parsing.ts`.
import type { Feature, Ticket } from './board';
import { messageOf } from './errors';
import type { GitHub, GitHubIssue } from './github';
import {
  parsedTicket,
  TRIAGE_STATUSES,
  withBlockerStates,
  type BlockedBy,
  type ParsedTicket,
  type TicketStatus,
  withoutSpecPrefix,
} from './ticket-parsing';

export type GitHubContents = {
  features: Feature[];
  /** Set when a GitHub call failed; whatever could still be read is in `features`. */
  error?: string;
};

/** The Features of the GitHub Project in `projectDir`. Never throws. */
export async function githubFeaturesIn(projectDir: string, projectName: string, github: GitHub): Promise<GitHubContents> {
  let issues: GitHubIssue[];
  try {
    issues = await github.listIssues(projectDir);
  } catch (error) {
    return { features: [], error: `Couldn't read the GitHub issues: ${messageOf(error)}` };
  }
  const featureIssues = issues.filter(isFeatureIssue);

  // A Feature issue whose sub-issues can't be listed still gets the issues that name it as parent.
  const errors: string[] = [];
  const parentOf = new Map<number, number>();
  for (const featureIssue of featureIssues) {
    try {
      for (const child of await github.listSubIssues(projectDir, featureIssue.number)) parentOf.set(child, featureIssue.number);
    } catch (error) {
      errors.push(`Couldn't read the sub-issues of #${featureIssue.number}: ${messageOf(error)}`);
    }
  }
  // Without a native link, a "## Parent" section naming the issue does the same.
  for (const issue of issues) {
    const parent = namedParent(issue.body);
    if (parent !== null && !parentOf.has(issue.number)) parentOf.set(issue.number, parent);
  }

  const features: Feature[] = featureIssues.map((featureIssue) => {
    const key = `${projectName}/#${featureIssue.number}`;
    const children = issues.filter((i) => parentOf.get(i.number) === featureIssue.number);
    return {
      key,
      slug: `#${featureIssue.number}`,
      title: withoutSpecPrefix(featureIssue.title) || featureIssue.title,
      spec: featureIssue.body,
      issue: null,
      closed: featureIssue.state === 'closed',
      updated: newestUpdate([featureIssue, ...children]),
      worktree: null,
      url: featureIssue.url,
      tickets: tickets(children, key),
    };
  });

  // Nothing is hidden: an issue whose parent isn't a Feature issue goes under "No feature".
  const featureIssueNumbers = new Set(featureIssues.map((featureIssue) => featureIssue.number));
  const orphans = issues.filter((i) => !isFeatureIssue(i) && !featureIssueNumbers.has(parentOf.get(i.number) ?? NaN));
  if (orphans.length > 0) {
    const key = `${projectName}/${NO_FEATURE}`;
    features.push({
      key,
      slug: NO_FEATURE,
      title: 'No feature',
      spec: null,
      issue: null,
      closed: false,
      updated: newestUpdate(orphans),
      worktree: null,
      tickets: tickets(orphans, key),
    });
  }
  return errors.length ? { features, error: errors.join('; ') } : { features };
}

const NO_FEATURE = 'no-feature';

/** The newest `updatedAt` among these issues. */
function newestUpdate(issues: GitHubIssue[]): number {
  return Math.max(...issues.map((i) => i.updatedAt));
}

/** An issue whose title starts with "Spec" is a Feature, not a Ticket. */
function isFeatureIssue(issue: GitHubIssue): boolean {
  return /^spec\b/i.test(issue.title);
}

/**
 * The issue number a body names as its parent, or null: a "## Parent" section whose
 * first line is `#N` ("## Parent\n\n#1"), or the one-line "## Parent #1".
 */
function namedParent(body: string): number | null {
  const match = body.match(/^##[ \t]*Parent\b[ \t]*(?:\n\s*)?#(\d+)/im);
  return match ? Number(match[1]) : null;
}

function tickets(issues: GitHubIssue[], featureKey: string): Ticket[] {
  const parsed = [...issues].sort((a, b) => a.number - b.number).map((i) => parseTicket(i, featureKey));
  return withBlockerStates(parsed);
}

function parseTicket(issue: GitHubIssue, featureKey: string): ParsedTicket {
  return parsedTicket({
    featureKey,
    num: `#${issue.number}`,
    title: issue.title,
    status: statusOf(issue),
    blockedBy: blockedByOf(issue.body),
    body: issue.body,
    updated: issue.closedAt ?? issue.updatedAt,
    location: { kind: 'url', url: issue.url },
  });
}

/**
 * The `#N` references under "Blocked by": a `## Blocked by` section (the to-tickets
 * issue template), else the first line that starts with `Blocked by:` (colon required,
 * bold allowed), so prose that merely starts with "Blocked by" names no blocker. Anything
 * else there ("None (can start immediately)") names no blocker either.
 */
function blockedByOf(body: string): BlockedBy {
  const section = body.match(/^#{2,6}[ \t]*Blocked by\b.*\n([\s\S]*?)(?=^#{1,6}[ \t]|(?![\s\S]))/im)?.[1];
  const line = body.match(/^[ \t]*(?:\*\*)?Blocked by(?:\*\*)?:(?:\*\*)?[ \t]*(.*)$/im)?.[1];
  const raw = (section ?? line ?? '').replace(/\s+/g, ' ').trim();
  const blockers = [...new Set([...raw.matchAll(/#(\d+)/g)].map((match) => `#${match[1]}`))];
  return { raw, blockers, note: null };
}

/**
 * The issue's triage status: `done` when it is closed, whatever its labels; otherwise its
 * triage label (`wontfix` first, so a dropped issue never looks open), or none (an empty
 * raw status) when it has no triage label. A label has no note after it.
 */
function statusOf(issue: GitHubIssue): TicketStatus {
  if (issue.state === 'closed') return { value: 'done', raw: 'done', note: null };
  const labels = issue.labels.map((label) => label.toLowerCase());
  const value = TRIAGE_STATUSES.find((status) => status !== 'done' && labels.includes(status)) ?? null;
  return { value, raw: value ?? '', note: null };
}

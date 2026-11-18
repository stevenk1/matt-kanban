// The local Features of one checkout: every `.scratch/<feature>/issues/NN-*.md` file,
// parsed into Tickets with their state (see `ticket-parsing.ts`). Part of the Board reader
// (seam 1); tested through `readBoard`. Parsing rules follow the spec's Implementation Decisions.
import type { Feature } from './board';
import { messageOf } from './errors';
import { joinPath, type FileSystem } from './file-system';
import {
  parsedTicket,
  TRIAGE_STATUSES,
  withBlockerStates,
  type BlockedBy,
  type ParsedTicket,
  type TicketStatus,
  withoutSpecPrefix,
} from './ticket-parsing';

export type FeatureContents = {
  features: Feature[];
  /** Set when `.scratch` itself couldn't be read; one bad Ticket file is an error on its Feature instead. */
  error?: string;
};

/** The Features under `checkoutDir/.scratch`, by folder name. Never throws. */
export async function featuresIn(checkoutDir: string, projectName: string, fs: FileSystem): Promise<FeatureContents> {
  const scratch = joinPath(checkoutDir, '.scratch');
  const features: Feature[] = [];
  try {
    if (!(await fs.exists(scratch))) return { features };
    for (const slug of (await fs.listDir(scratch)).sort()) {
      const folder = joinPath(scratch, slug);
      const feature = await readFeature(folder, slug, `${projectName}/${slug}`, fs);
      if (feature) features.push(feature);
    }
    return { features };
  } catch (error) {
    return { features, error: `Couldn't read the Features in .scratch: ${messageOf(error)}` };
  }
}

/**
 * One `.scratch/<slug>/` folder: a Feature from its first document (an `issues/` folder, a
 * `spec.md` or an `issue.md`), else null. A file that can't be read is named in the Feature's error.
 */
async function readFeature(folder: string, slug: string, key: string, fs: FileSystem): Promise<Feature | null> {
  const specPath = joinPath(folder, 'spec.md');
  const issuePath = joinPath(folder, 'issue.md');
  const issues = joinPath(folder, 'issues');
  const hasSpec = await fs.exists(specPath);
  const hasIssue = await fs.exists(issuePath);
  const hasIssues = await isDirectory(issues, fs);
  if (!hasSpec && !hasIssue && !hasIssues) return null;

  const unreadable: string[] = [];
  const readOrNote = async <T>(what: string, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      unreadable.push(`${what}: ${messageOf(error)}`);
      return null;
    }
  };

  const specFile = hasSpec ? await readOrNote('spec.md', () => readDocument(specPath, fs)) : null;
  const issueFile = hasIssue ? await readOrNote('issue.md', () => readDocument(issuePath, fs)) : null;
  const spec = specFile?.text ?? null;
  const issue = issueFile?.text ?? null;
  // Without issues/, the Feature has no Tickets yet.
  const files = hasIssues ? ((await readOrNote('issues/', () => fs.listDir(issues))) ?? []) : [];
  const parsedTickets: ParsedTicket[] = [];
  for (const file of files.filter((name) => TICKET_FILE.test(name))) {
    const parsed = await readOrNote(`issues/${file}`, () => readTicket(joinPath(issues, file), key, fs));
    if (parsed) parsedTickets.push(parsed);
  }
  parsedTickets.sort((a, b) => a.ticket.num.localeCompare(b.ticket.num, undefined, { numeric: true }));

  const tickets = withBlockerStates(parsedTickets);
  const modifiedTimes = [specFile, issueFile].map((file) => file?.modifiedAt ?? 0);
  const feature: Feature = {
    key,
    slug,
    title: featureTitle(spec, issue) ?? slug,
    spec,
    issue,
    closed: issue !== null && isClosedStatus(statusOf(issue)),
    updated: Math.max(...modifiedTimes, ...tickets.map((t) => t.updated)),
    worktree: null,
    tickets,
  };
  return unreadable.length ? { ...feature, error: `Couldn't read ${unreadable.join('; ')}` } : feature;
}

const TICKET_FILE = /^\d+.*\.md$/;

/**
 * A Ticket file, spec.md or issue.md: its text and when it last changed. A time that can't be read
 * is 0, so the text isn't lost over it.
 */
async function readDocument(path: string, fs: FileSystem): Promise<{ text: string; modifiedAt: number }> {
  const text = await fs.readText(path);
  const modifiedAt = await fs.stat(path).then(
    (stat) => stat.modifiedAt,
    () => 0,
  );
  return { text, modifiedAt };
}

async function readTicket(path: string, featureKey: string, fs: FileSystem): Promise<ParsedTicket> {
  const { text: body, modifiedAt } = await readDocument(path, fs);
  const num = ticketNumber(path);
  return parsedTicket({
    featureKey,
    num,
    title: ticketTitle(body) ?? num,
    status: statusOf(body),
    blockedBy: blockedByOf(body),
    body,
    updated: modifiedAt,
    location: { kind: 'file', path },
  });
}

/**
 * The first Status line; later ones (in Comments, say) don't count. Its value starts with a
 * triage status, ending at a word boundary, or it is unknown.
 */
function statusOf(body: string): TicketStatus {
  const raw = firstLabelledValue(body, 'Status');
  const value = TRIAGE_STATUSES.find((status) => new RegExp(`^${status}(?![\\w-])`, 'i').test(raw)) ?? null;
  if (!value) return { value: null, raw, note: null };
  return { value, raw, note: raw.slice(value.length).trim() || null };
}

/** A Feature's own issue is over once its status is `done` or `wontfix`. */
function isClosedStatus(status: TicketStatus): boolean {
  return status.value === 'done' || status.value === 'wontfix';
}

/**
 * The first Blocked by line. The value is split on commas and on an "and" before a
 * number (so "02 Begin and end a sitting" stays one part); each part starting with a
 * 1-2 digit number names a blocker. A part that doesn't, or any part with a parenthesis,
 * keeps the whole raw value as a note. "None…" means none.
 */
function blockedByOf(body: string): BlockedBy {
  const raw = firstLabelledValue(body, 'Blocked by');
  if (raw === '' || /^none\b/i.test(raw)) return { raw, blockers: [], note: null };

  const blockers = new Set<string>();
  let prose = false;
  for (const part of raw.split(/,|\band\b(?=\s*\d)/).map((p) => p.trim())) {
    if (part === '') continue;
    const num = part.match(/^(\d{1,2})\b/)?.[1];
    if (num) blockers.add(padTicketNumber(num));
    if (!num || /[()]/.test(part)) prose = true;
  }
  return { raw, blockers: [...blockers], note: prose ? raw : null };
}

/** The value of the first `**Label:**` or plain `Label:` line, trimmed; '' when there is none. */
function firstLabelledValue(body: string, label: string): string {
  const line = new RegExp(`^[ \\t]*(?:\\*\\*${label}:\\*\\*|${label}:)[ \\t]*(.*)$`, 'm');
  return body.match(line)?.[1].trim() ?? '';
}

/** The spec's first heading, without a leading "Spec:"; else the issue's first heading. */
function featureTitle(spec: string | null, issue: string | null): string | null {
  const specHeading = spec === null ? null : firstHeading(spec);
  const issueHeading = issue === null ? null : firstHeading(issue);
  return (specHeading && withoutSpecPrefix(specHeading)) || issueHeading?.trim() || null;
}

/** The Ticket's first heading, without its leading number ("01: Rail gallery"). */
function ticketTitle(body: string): string | null {
  return firstHeading(body)?.replace(/^\d+\s*[:.\-–]\s*/, '').trim() || null;
}

function firstHeading(markdown: string): string | null {
  return markdown.match(/^#[ \t]+(.+)$/m)?.[1] ?? null;
}

/** The file name's leading number, zero-padded. */
function ticketNumber(path: string): string {
  const name = path.split('/').pop() ?? '';
  return padTicketNumber(name.match(/^\d+/)?.[0] ?? '');
}

/** Ticket numbers are compared as two-digit strings: "1" and "01" are the same Ticket. */
function padTicketNumber(num: string): string {
  return num.padStart(2, '0');
}

async function isDirectory(path: string, fs: FileSystem): Promise<boolean> {
  return (await fs.exists(path)) && (await fs.stat(path)).isDirectory;
}

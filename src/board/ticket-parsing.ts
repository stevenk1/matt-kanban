// Ticket parsing shared by the local and the GitHub Features readers: the triage vocabulary,
// the Ticket value both build from what they found, how its status and blockers become its
// state, and a Feature title without its "Spec:" prefix.
// Part of the Board reader (seam 1); tested through `readBoard`. Rules follow the spec's
// Implementation Decisions ("Ticket state").
import { isDoneOrWontFix, type Ticket } from './board';

/**
 * A Feature's title from its spec's heading or its GitHub Spec issue's title: without a leading
 * "Spec", with or without a colon ("Spec: Rail page", "SPEC Rail page"). A word that merely
 * starts with "spec" ("Specification") is kept.
 */
export function withoutSpecPrefix(heading: string): string {
  return heading.replace(/^spec\b\s*:?\s*/i, '').trim();
}

/** The triage vocabulary a status is matched against (docs/agents/triage-labels.md). */
export const TRIAGE_STATUSES = ['done', 'wontfix', 'ready-for-agent', 'ready-for-human', 'needs-triage', 'needs-info'];

export type TicketStatus = {
  /** The triage status matched, or null when there is none. */
  value: string | null;
  /** The whole status text; shown as the raw status when `value` is null. */
  raw: string;
  /** Text after a known status value. */
  note: string | null;
};

export type BlockedBy = {
  /** The whole "Blocked by" text. */
  raw: string;
  /**
   * The blocking Tickets' numbers, in order, without repeats, written the way the Feature
   * writes its Ticket numbers: zero-padded for a local Ticket ("01"), `#N` for a GitHub
   * issue ("#12").
   */
  blockers: string[];
  /** The raw text when part of it isn't a plain Ticket number (prose, parentheses). */
  note: string | null;
};

/** A Ticket as read from its own file or issue, before its blockers are looked up in its Feature. */
export type ParsedTicket = { ticket: Ticket; blockedBy: BlockedBy };

/** What a reader found about one Ticket; `parsedTicket` derives the rest. */
type TicketFound = {
  featureKey: string;
  num: string;
  title: string;
  status: TicketStatus;
  blockedBy: BlockedBy;
  body: string;
  updated: number;
  location: Ticket['location'];
};

/**
 * The Ticket with its state from its status alone: Done, Won't fix, Your turn, or Ready until
 * `withBlockerStates` looks up its blockers.
 */
export function parsedTicket({ featureKey, num, title, status, blockedBy, body, updated, location }: TicketFound): ParsedTicket {
  const ticket: Ticket = {
    id: `${featureKey}/${num}`,
    num,
    title,
    state: stateOfStatus(status.value),
    rawStatus: status.value ?? status.raw,
    statusNote: status.note,
    unknownStatus: status.value === null,
    blockers: blockedBy.blockers,
    openBlockers: [],
    blockerNote: blockedBy.note,
    criteria: criteriaOf(body),
    updated,
    location,
    body,
  };
  return { ticket, blockedBy };
}

function stateOfStatus(value: string | null): Ticket['state'] {
  if (value === 'done') return 'done';
  if (value === 'wontfix') return 'wontfix';
  if (value === 'ready-for-human') return 'yourturn';
  return 'ready';
}

/**
 * The Ticket states once blockers are looked up within the Feature. Done, Won't fix and Your
 * turn come from the status alone and keep it; a Your turn Ticket's open blockers are only
 * noted. Any other Ticket is Blocked while any of its blockers is neither Done nor Won't fix
 * (a Your turn blocker blocks), else Ready. A blocker number with no Ticket in the Feature
 * doesn't block; the raw `Blocked by` text becomes the note instead.
 */
export function withBlockerStates(parsedTickets: ParsedTicket[]): Ticket[] {
  const byNum = new Map(parsedTickets.map(({ ticket }) => [ticket.num, ticket]));
  return parsedTickets.map(({ ticket, blockedBy }) => {
    const namesUnknownTicket = ticket.blockers.some((num) => !byNum.has(num));
    const blockerNote = namesUnknownTicket ? blockedBy.raw : ticket.blockerNote;
    if (isDoneOrWontFix(ticket.state)) return { ...ticket, blockerNote };

    const openBlockers = ticket.blockers.filter((num) => {
      const blocker = byNum.get(num);
      return blocker !== undefined && !isDoneOrWontFix(blocker.state);
    });
    if (ticket.state === 'yourturn') return { ...ticket, openBlockers, blockerNote };
    return { ...ticket, state: openBlockers.length > 0 ? 'blocked' : 'ready', openBlockers, blockerNote };
  });
}

/** The `- [ ]` and `- [x]` boxes anywhere in the Ticket. */
function criteriaOf(body: string): Ticket['criteria'] {
  return {
    checked: body.match(/^[ \t]*- \[[xX]\]/gm)?.length ?? 0,
    total: body.match(/^[ \t]*- \[[ xX]\]/gm)?.length ?? 0,
  };
}

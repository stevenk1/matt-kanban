#!/usr/bin/env node
// Builds throwaway Projects for checking the Board by hand (docs/agents/dev-loop.md), with real
// git worktrees: run from the repo root, so agents whose worktree guard refuses git elsewhere
// can still make them.
//
//   npm run dev-fixture -- <empty absolute folder>           one Project "demo", see below
//   npm run dev-fixture -- <folder> worktree <name>          adds ../demo-worktrees/<name> live
//   npm run dev-fixture -- <empty absolute folder> showcase  three invented Projects, see below
//
// "demo" has: a Feature with a spec and two Tickets, a spec-only Feature, an issue-only Feature,
// and a sibling worktree ../demo-worktrees/side holding a worktree-only Feature.
// "showcase", for the README's screenshots, has the Projects recipe-app, invoice-api and
// field-notes, all invented: Features of Blocked, Ready and Done Tickets changed over the past
// days, a worktree ../recipe-app-worktrees/offline-mode, and one Story at in-step:implement.
// Point the app at it with BOARD_DEV_SCAN_ROOT=<folder> and delete the folder when done.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';

const [root, command, name] = process.argv.slice(2);
if (!root || !isAbsolute(root)) fail('Give an absolute folder: npm run dev-fixture -- <folder> [showcase | worktree <name>]');
const project = join(root, 'demo');

/**
 * The showcase Projects. A Feature has a spec or an issue, and Tickets; each Ticket's criteria
 * start with "[x]" when met. `daysAgo` dates a Feature's files, which orders the Feature list and
 * sets its "2d ago".
 */
const SHOWCASE = [
  {
    name: 'recipe-app',
    features: [
      {
        slug: 'meal-planner',
        spec: 'Weekly meal planner',
        problem: 'Households plan their meals on paper, then write the shopping list again by hand.',
        daysAgo: 0.1,
        tickets: [
          {
            num: '01', slug: 'week-grid', title: 'Week grid with a slot per meal', status: 'done', blockedBy: 'None',
            what: 'A seven-day grid with breakfast, lunch and dinner slots, saved per household.',
            criteria: ['[x] Seven days, three slots each', '[x] The plan is saved per household'],
          },
          {
            num: '02', slug: 'drag-recipe', title: 'Drag a recipe onto a day', status: 'done', blockedBy: '01',
            what: 'Recipes from the sidebar can be dropped into any empty slot of the week grid.',
            criteria: ['[x] A recipe drops into an empty slot', '[x] A filled slot can be cleared'],
          },
          {
            num: '03', slug: 'shopping-list', title: "Shopping list from the week's plan", status: 'ready-for-agent', blockedBy: '01, 02',
            what:
              'One shopping list from every recipe planned this week: ingredients merged by name and unit, ' +
              'grouped by supermarket aisle, leaving out what the pantry already holds.',
            criteria: [
              '[x] Ingredients of the same name and unit are added up',
              '[ ] Items are grouped by aisle, in store order',
              '[ ] Pantry items are left out, and listed apart',
              '[ ] The list updates when the plan changes',
            ],
          },
          {
            num: '04', slug: 'share-list', title: 'Share the shopping list', status: 'needs-triage', blockedBy: '03',
            what: 'Send the list to another household member, who can tick items off while shopping.',
            criteria: ['[ ] A shared list shows ticks from both phones'],
          },
          {
            num: '05', slug: 'scale-servings', title: 'Scale servings per meal', status: 'ready-for-human', blockedBy: 'None',
            what: 'Each planned meal can be cooked for a different number of people; quantities follow.',
            criteria: ['[ ] Servings can be set per slot', '[ ] Quantities round to sensible units'],
          },
        ],
      },
      {
        slug: 'recipe-import',
        spec: 'Import recipes from a link',
        problem: 'Copying a recipe from a website by hand takes longer than cooking it.',
        daysAgo: 2,
        tickets: [
          {
            num: '01', slug: 'schema-org', title: 'Read schema.org Recipe markup', status: 'done', blockedBy: 'None',
            what: 'Most recipe sites embed a schema.org Recipe: read the title, ingredients and steps from it.',
            criteria: ['[x] Title, ingredients and steps are read'],
          },
          {
            num: '02', slug: 'fallback-scraper', title: 'Fall back to the page text', status: 'ready-for-agent', blockedBy: '01',
            what: 'When a page has no markup, find the ingredient list and the steps in its text.',
            criteria: ['[ ] Ingredient lists are found by their units', '[ ] Numbered steps are kept in order'],
          },
          {
            num: '03', slug: 'review-screen', title: 'Review an import before saving', status: 'needs-triage', blockedBy: '02',
            what: 'Show what was read, beside the page, before the recipe is saved.',
            criteria: ['[ ] Every read field can be corrected'],
          },
        ],
      },
    ],
    worktree: {
      name: 'offline-mode',
      features: [
        {
          slug: 'offline-mode',
          spec: 'Cook without a connection',
          problem: 'Kitchens and holiday homes often have no signal.',
          daysAgo: 1,
          tickets: [
            {
              num: '01', slug: 'cache-recipes', title: 'Keep planned recipes on the device', status: 'ready-for-agent', blockedBy: 'None',
              what: "The week's planned recipes stay readable without a connection.",
              criteria: ['[ ] Planned recipes open in flight mode'],
            },
            {
              num: '02', slug: 'sync-edits', title: 'Sync edits made offline', status: 'needs-triage', blockedBy: '01',
              what: 'Edits made offline are sent once the connection is back; the newest edit wins.',
              criteria: ['[ ] No edit is lost when two phones edit offline'],
            },
          ],
        },
      ],
    },
    stories: {
      'shopping-list': [
        '---',
        'goal: Weekly shopping list',
        'status: active',
        '---',
        '',
        '## Log',
        '- 2026-11-12 grill-with-docs: scoped the shopping list',
        '- 2026-11-13 to-issues: split it into Tickets 03 and 04',
        '- 2026-11-17 implement: started Ticket 03',
        '',
        '## Next',
        'Waiting: in-step:implement',
        'Recommended: code-review - once 03 is done',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'invoice-api',
    features: [
      {
        slug: 'pdf-invoices',
        spec: 'PDF invoices',
        problem: 'Customers want an invoice they can file, not a web page.',
        daysAgo: 0.5,
        tickets: [
          {
            num: '01', slug: 'invoice-template', title: 'Render the invoice template', status: 'done', blockedBy: 'None',
            what: 'An invoice renders to PDF with the sender, the customer and the totals.',
            criteria: ['[x] Sender, customer and totals are shown'],
          },
          {
            num: '02', slug: 'vat-lines', title: 'Line items with VAT per rate', status: 'done', blockedBy: '01',
            what: 'Each line carries its VAT rate; the totals are given per rate.',
            criteria: ['[x] Totals per VAT rate', '[x] Rounding per line, as the tax office asks'],
          },
          {
            num: '03', slug: 'attach-pdf', title: 'Attach the PDF to the invoice email', status: 'ready-for-agent', blockedBy: '01, 02',
            what: 'The invoice email carries the PDF, named after the invoice number.',
            criteria: ['[ ] The file is named after the invoice number'],
          },
        ],
      },
      {
        slug: 'payment-reminders',
        spec: 'Payment reminders',
        problem: 'Late payments are chased by hand, or not at all.',
        daysAgo: 3,
        tickets: [
          {
            num: '01', slug: 'reminder-schedule', title: 'Reminder schedule per customer', status: 'ready-for-agent', blockedBy: 'None',
            what: 'A customer can have a reminder schedule of its own; the default is 7, 14 and 30 days.',
            criteria: ['[ ] The default schedule applies to new customers'],
          },
          {
            num: '02', slug: 'reminder-templates', title: 'Reminder email templates', status: 'needs-triage', blockedBy: '01',
            what: 'A friendly first reminder, a firmer second one and a final notice.',
            criteria: ['[ ] Each reminder names the invoice and its amount'],
          },
          {
            num: '03', slug: 'stop-when-paid', title: 'Stop reminders once paid', status: 'needs-triage', blockedBy: '01',
            what: 'A payment that settles the invoice cancels the reminders still due.',
            criteria: ['[ ] A partial payment keeps the reminders going'],
          },
        ],
      },
      {
        slug: 'rate-limits',
        issue: 'Rate-limit the public API',
        problem: 'A single client can still exhaust the API. Limit requests per API key.',
        daysAgo: 5,
      },
    ],
  },
  {
    name: 'field-notes',
    features: [
      {
        slug: 'photo-attachments',
        spec: 'Photos in notes',
        problem: 'A note about a plant or a bird is half a note without its photo.',
        daysAgo: 1.5,
        tickets: [
          {
            num: '01', slug: 'attach-photos', title: 'Attach photos to a note', status: 'done', blockedBy: 'None',
            what: 'Take or pick photos and keep them with the note.',
            criteria: ['[x] Photos from the camera and the library'],
          },
          {
            num: '02', slug: 'thumbnail-strip', title: 'Thumbnail strip under the note', status: 'ready-for-agent', blockedBy: '01',
            what: "A row of thumbnails under the note's text; a tap opens the photo.",
            criteria: ['[ ] Thumbnails load lazily'],
          },
          {
            num: '03', slug: 'exif-location', title: 'Place the note from the photo location', status: 'needs-triage', blockedBy: '02',
            what: "Use a photo's EXIF location when the note has none.",
            criteria: ['[ ] The note asks before it takes the location'],
          },
        ],
      },
      {
        slug: 'markdown-export',
        spec: 'Export notes to Markdown',
        problem: 'Notes should leave the app as plain files, photos beside them.',
        daysAgo: 6,
      },
    ],
  },
];

if (command === 'worktree') {
  if (!name) fail('Name the worktree: npm run dev-fixture -- <folder> worktree <name>');
  addWorktree(name, `${name}-feature`);
  console.log(`Ready: BOARD_DEV_SCAN_ROOT=${root} (Project ${project})`);
} else if (command === 'showcase') {
  requireEmpty();
  showcase();
  console.log(`Ready: BOARD_DEV_SCAN_ROOT=${root} (Projects ${SHOWCASE.map((p) => p.name).join(', ')})`);
} else if (command) {
  fail(`Unknown command "${command}"`);
} else {
  requireEmpty();
  startProject(project);
  write(project, '.scratch/tickets/spec.md', '# Spec: Feature with Tickets\n');
  write(project, '.scratch/tickets/issues/01-first.md', ticket('01: First', 'done', 'None'));
  write(project, '.scratch/tickets/issues/02-second.md', ticket('02: Second', 'ready-for-agent', '01'));
  write(project, '.scratch/spec-only/spec.md', '# Spec: Spec without Tickets\n');
  write(project, '.scratch/issue-only/issue.md', '# Triaged issue without a spec\n\nStatus: ready-for-agent\n');
  commitAll(project);
  addWorktree('side', 'side-feature');
  console.log(`Ready: BOARD_DEV_SCAN_ROOT=${root} (Project ${project})`);
}

/** `git worktree add ../demo-worktrees/<name>`, then a worktree-only Feature in it. */
function addWorktree(worktree, feature) {
  const dir = createWorktree(project, worktree);
  write(dir, `.scratch/${feature}/issues/01-only-here.md`, ticket(`01: Only in worktree ${worktree}`, 'ready-for-agent', 'None'));
}

/** `git worktree add ../<Project>-worktrees/<name>` on a new branch <name>; returns its folder. */
function createWorktree(projectDir, worktree) {
  const dir = join(dirname(projectDir), `${basename(projectDir)}-worktrees`, worktree);
  git(projectDir, 'worktree', 'add', '-q', '-b', worktree, dir);
  return dir;
}

/** A Ticket file's text: its heading, Blocked by and Status lines, then its body's sections. */
function ticket(title, status, blockedBy, sections = ['- [ ] A criterion']) {
  return [`# ${title}`, `**Blocked by:** ${blockedBy}`, `**Status:** ${status}`, ...sections].join('\n\n') + '\n';
}

/** What makes `dir` a Project: the tracker document the skills' setup writes. */
function startProject(dir) {
  write(dir, 'docs/agents/issue-tracker.md', '# Issue tracker: Local Markdown\n');
}

/** Each showcase Project, committed, then its worktree's Features written in the worktree only. */
function showcase() {
  for (const { name: projectName, features, worktree, stories = {} } of SHOWCASE) {
    const dir = join(root, projectName);
    startProject(dir);
    for (const feature of features) writeFeature(dir, feature);
    for (const [slug, text] of Object.entries(stories)) write(dir, `.scratch/stories/${slug}.md`, text, 0.05);
    commitAll(dir);
    if (worktree) {
      const worktreeDir = createWorktree(dir, worktree.name);
      for (const feature of worktree.features) writeFeature(worktreeDir, feature);
    }
  }
}

/** A showcase Feature's spec or issue and its Tickets, all dated `daysAgo`. */
function writeFeature(dir, { slug, spec, issue, problem, daysAgo, tickets = [] }) {
  if (spec) write(dir, `.scratch/${slug}/spec.md`, `# Spec: ${spec}\n\n## Problem Statement\n\n${problem}\n`, daysAgo);
  if (issue) write(dir, `.scratch/${slug}/issue.md`, `# ${issue}\n\nStatus: needs-triage\n\n${problem}\n`, daysAgo);
  for (const t of tickets) {
    const criteria = t.criteria.map((criterion) => `- ${criterion}`).join('\n');
    const sections = [`## What to build\n\n${t.what}`, `## Acceptance criteria\n\n${criteria}`];
    write(dir, `.scratch/${slug}/issues/${t.num}-${t.slug}.md`, ticket(`${t.num}: ${t.title}`, t.status, t.blockedBy, sections), daysAgo);
  }
}

/** Writes `text` to `base/path`, dated `daysAgo` days back when given. */
function write(base, path, text, daysAgo) {
  const file = join(base, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  if (daysAgo !== undefined) {
    const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    utimesSync(file, at, at);
  }
}

function commitAll(dir) {
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture');
}

function requireEmpty() {
  if (existsSync(root) && readdirSync(root).length > 0) fail(`${root} isn't empty`);
}

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

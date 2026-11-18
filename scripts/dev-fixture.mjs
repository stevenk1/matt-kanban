#!/usr/bin/env node
// Builds throwaway Projects for checking the Board by hand (docs/agents/dev-loop.md), with real
// git worktrees: run from the repo root, so agents whose worktree guard refuses git elsewhere
// can still make them.
//
//   npm run dev-fixture -- <empty absolute folder>          one Project "demo", see below
//   npm run dev-fixture -- <folder> worktree <name>         adds ../demo-worktrees/<name> live
//
// "demo" has: a Feature with a spec and two Tickets, a spec-only Feature, an issue-only Feature,
// and a sibling worktree ../demo-worktrees/side holding a worktree-only Feature. Point the app at
// it with BOARD_DEV_SCAN_ROOT=<folder> and delete the folder when done.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

const [root, command, name] = process.argv.slice(2);
if (!root || !isAbsolute(root)) fail('Give an absolute folder: npm run dev-fixture -- <folder> [worktree <name>]');
const project = join(root, 'demo');

if (command === 'worktree') {
  if (!name) fail('Name the worktree: npm run dev-fixture -- <folder> worktree <name>');
  addWorktree(name, `${name}-feature`);
} else if (command) {
  fail(`Unknown command "${command}"`);
} else {
  if (existsSync(root) && readdirSync(root).length > 0) fail(`${root} isn't empty`);
  write(project, 'docs/agents/issue-tracker.md', '# Issue tracker: Local Markdown\n');
  write(project, '.scratch/tickets/spec.md', '# Spec: Feature with Tickets\n');
  write(project, '.scratch/tickets/issues/01-first.md', ticket('01: First', 'done', 'None'));
  write(project, '.scratch/tickets/issues/02-second.md', ticket('02: Second', 'ready-for-agent', '01'));
  write(project, '.scratch/spec-only/spec.md', '# Spec: Spec without Tickets\n');
  write(project, '.scratch/issue-only/issue.md', '# Triaged issue without a spec\n\nStatus: ready-for-agent\n');
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture');
  addWorktree('side', 'side-feature');
}
console.log(`Ready: BOARD_DEV_SCAN_ROOT=${root} (Project ${project})`);

/** `git worktree add ../demo-worktrees/<name>`, then a worktree-only Feature in it. */
function addWorktree(worktree, feature) {
  const dir = join(root, 'demo-worktrees', worktree);
  git(project, 'worktree', 'add', '-q', '-b', worktree, dir);
  write(dir, `.scratch/${feature}/issues/01-only-here.md`, ticket(`01: Only in worktree ${worktree}`, 'ready-for-agent', 'None'));
}

function ticket(title, status, blockedBy) {
  return `# ${title}\n\n**Blocked by:** ${blockedBy}\n\n**Status:** ${status}\n\n- [ ] A criterion\n`;
}

function write(base, path, text) {
  const file = join(base, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'inherit'] });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// The Tauri implementation of the GitHub port: runs `gh` through the shell plugin, from
// the Project's folder, so `gh` works out the repository from its git remote.
// The app's capabilities (src-tauri/capabilities/default.json) allow exactly these
// commands, by name and with these arguments; keep the two in step.
import { Command } from '@tauri-apps/plugin-shell';
import type { GitHub, GitHubIssue } from '../board/github';

/**
 * Where `gh` may live. A GUI app on macOS doesn't inherit the shell's PATH, so `gh` is
 * found by absolute path: Homebrew on Apple silicon first, then Homebrew on Intel.
 * Each is a separate set of scoped command names in the capabilities.
 */
const GH_LOCATIONS = [
  { suffix: 'homebrew', path: '/opt/homebrew/bin/gh' },
  { suffix: 'usr-local', path: '/usr/local/bin/gh' },
];

const ISSUE_FIELDS = 'number,title,state,labels,body,updatedAt,closedAt,url';

/** `gh issue list --json …` output for one issue. */
type GhIssue = {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  labels: { name: string }[];
  body: string | null;
  updatedAt: string;
  closedAt: string | null;
  url: string;
};

export const tauriGitHub: GitHub = {
  async listIssues(projectDir) {
    const args = ['issue', 'list', '--state', 'all', '--limit', '1000', '--json', ISSUE_FIELDS];
    const issues = JSON.parse(await gh('gh-issue-list', args, projectDir)) as GhIssue[];
    return issues.map(toIssue);
  },
  async listSubIssues(projectDir, issueNumber) {
    // `{owner}/{repo}` is filled in by gh from the folder's repository. A parent holds at
    // most 100 sub-issues, so one page of 100 is all of them.
    const endpoint = `repos/{owner}/{repo}/issues/${issueNumber}/sub_issues?per_page=100`;
    const subIssues = JSON.parse(await gh('gh-sub-issues', ['api', endpoint], projectDir)) as { number: number }[];
    return subIssues.map((subIssue) => subIssue.number);
  },
};

/**
 * Runs one scoped `gh` command in `cwd` and returns its stdout. Moves on to the next
 * location only when there is no `gh` at this one; any other failure (a scope denial, a
 * spawn error, gh's own non-zero exit) is reported as itself.
 */
async function gh(name: string, args: string[], cwd: string): Promise<string> {
  for (const location of GH_LOCATIONS) {
    let output;
    try {
      output = await Command.create(`${name}-${location.suffix}`, args, { cwd }).execute();
    } catch (error) {
      if (isNotFound(error)) continue;
      throw new Error(`Couldn't run ${location.path}: ${messageOf(error)}`);
    }
    if (output.code !== 0) throw new Error(output.stderr.trim() || `gh exited with code ${output.code}`);
    return output.stdout;
  }
  throw new Error(`gh isn't installed (looked in ${GH_LOCATIONS.map((l) => l.path).join(' and ')})`);
}

/** The spawn error for a program that isn't there: the OS's ENOENT, as Rust reports it. */
function isNotFound(error: unknown): boolean {
  return /No such file or directory|os error 2\b|ENOENT/i.test(messageOf(error));
}

/** The shell plugin rejects with a plain string; anything else is handled too. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toIssue(issue: GhIssue): GitHubIssue {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state === 'CLOSED' ? 'closed' : 'open',
    labels: issue.labels.map((label) => label.name),
    body: issue.body ?? '',
    updatedAt: Date.parse(issue.updatedAt),
    closedAt: issue.closedAt ? Date.parse(issue.closedAt) : null,
    url: issue.url,
  };
}

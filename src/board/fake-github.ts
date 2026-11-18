// A fake GitHub port for the Board reader's tests: canned issues and sub-issues per
// Project folder, and a way to make a Project's calls fail.
import type { GitHub, GitHubIssue } from './github';

/** What GitHub holds for one Project. */
export type FakeGitHubProject = {
  issues: GitHubIssue[];
  /** Parent issue number → its native sub-issue numbers, or the error listing them fails with. */
  subIssues?: Record<number, number[] | Error>;
  /** When set, every call for this Project rejects with this message. */
  failWith?: string;
};

/** A GitHub port serving `projects`, keyed by Project folder. */
export function fakeGitHub(projects: Record<string, FakeGitHubProject>): GitHub {
  const projectAt = (projectDir: string): FakeGitHubProject => {
    const project = projects[projectDir];
    if (!project) throw new Error(`no GitHub issues for ${projectDir}`);
    if (project.failWith) throw new Error(project.failWith);
    return project;
  };
  return {
    listIssues: async (projectDir) => projectAt(projectDir).issues,
    async listSubIssues(projectDir, issueNumber) {
      const subIssues = projectAt(projectDir).subIssues?.[issueNumber] ?? [];
      if (subIssues instanceof Error) throw subIssues;
      return subIssues;
    },
  };
}

/** An open issue with no labels; override any field. */
export function issue(number: number, fields: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number,
    title: `Issue ${number}`,
    state: 'open',
    labels: [],
    body: '',
    updatedAt: Date.UTC(2026, 10, 1),
    closedAt: null,
    url: `https://github.com/owner/repo/issues/${number}`,
    ...fields,
  };
}

// The GitHub port the Board reader reads a GitHub Project's issues through. Read-only by
// design: it has no way to write, so no code path behind it can change an issue.
// Each call is made for one Project, by its folder; the implementation works out which
// GitHub repository that folder belongs to.

export type GitHubIssue = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  /** Label names. */
  labels: string[];
  body: string;
  /** Epoch milliseconds. */
  updatedAt: number;
  /** Epoch milliseconds; null while the issue is open. */
  closedAt: number | null;
  url: string;
};

export interface GitHub {
  /** Every issue of the Project's repository, open and closed (pull requests excluded). */
  listIssues(projectDir: string): Promise<GitHubIssue[]>;
  /** The numbers of one issue's native sub-issues. */
  listSubIssues(projectDir: string, issueNumber: number): Promise<number[]>;
}

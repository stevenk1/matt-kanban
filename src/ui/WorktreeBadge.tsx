// The "worktree" badge: marks a Feature row or Ticket card whose Feature is found only in a
// worktree, naming it, so it's plain the work hasn't reached the main checkout.
import './worktree-badge.css';

export function WorktreeBadge({ worktree }: { worktree: string | null }) {
  if (worktree === null) return null;
  // The title holds the full name, which a long name's ellipsis cuts off.
  return (
    <span className="worktree-badge" title={worktree}>
      worktree {worktree}
    </span>
  );
}

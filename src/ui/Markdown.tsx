// Markdown from a Ticket or spec, rendered as HTML. The text is the user's own, but it is
// still sanitized, so raw HTML in it can never run in the Board's window.
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useMemo, type MouseEvent } from 'react';
import './markdown.css';

/** A sanitizer of the Board's own, so its hook doesn't leak to other DOMPurify users. */
const purify = DOMPurify();
// Links don't navigate (see keepWindowOnBoard), so each one shows its target on hover instead.
purify.addHook('afterSanitizeAttributes', (node) => {
  const href = node.tagName === 'A' ? node.getAttribute('href') : null;
  if (href && !node.hasAttribute('title')) node.setAttribute('title', href);
});

type Props = {
  markdown: string;
  /** The region's accessible name. */
  label: string;
  className?: string;
};

export function Markdown({ markdown, label, className }: Props) {
  const html = useMemo(() => purify.sanitize(marked.parse(markdown, { async: false })), [markdown]);
  return (
    <section
      aria-label={label}
      className={className ? `md ${className}` : 'md'}
      onClick={keepWindowOnBoard}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * A link in a Ticket would load its target in the Board's own window, with no way back, and
 * a relative link points into the Project, not at the app. So a click on a link does nothing.
 */
function keepWindowOnBoard(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('a')) event.preventDefault();
}

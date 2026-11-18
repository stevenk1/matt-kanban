# Coding standards

Judgement calls the reviewer enforces. Mechanical rules live in tests instead (read-only capabilities, Tauri imports only in the shell), so they aren't repeated here.

## Names speak the glossary

Identifiers, types, CSS classes, test names and comments use `GLOSSARY.md`'s terms for domain concepts. A word the glossary lists under _Avoid_ is a violation when it names that concept. Common slips:
- "open" or "todo" for Ready;
- "resolved", "finished" or "closed" for Done;
- "waiting" for Blocked;
- "repo" or "app" for Project;
- "spec" for a Feature.

A plain verb is fine ("open the Settings window", "Open in VS Code"). A new domain concept gets a glossary entry before it gets a name in code.

## One helper per job

Before writing a helper, look for one in the shared modules:
- `src/board/errors.ts`, `file-system.ts` (paths) and `ticket-parsing.ts`;
- `src/ui/TicketMeta.tsx` and `ticket-counts.ts`;
- the test fixtures `reader-fixtures.ts` and `board-fixtures.tsx`.

Extend the one that fits, or move a private helper into a shared module when a second caller needs it. A second copy of the same logic is a violation.

## Styles stay with their component

Each component's stylesheet prefixes its classes with the component's name (`mini-card`, `ticket-detail-body`). Only `src/styles.css` holds unprefixed rules: colour and motion tokens, shared keyframes, and app-wide resets (such as the hand cursor on what can be clicked). A style that several components share gets its own stylesheet, prefixed with what it draws (`push-button.css`, `.push-button`). Colours come from tokens, never raw values; durations and curves come from the motion tokens.

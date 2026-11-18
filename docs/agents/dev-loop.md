# Dev loop

How to build, check and look at the Board. Read this before you implement a ticket or check one by hand.

## Where code lives

The spec's two test seams decide the layout:

- `src/board/`: the **Board reader**, pure and behind ports (file system, GitHub). Seam 1: test it through `readBoard` on real temp-dir trees (`reader-fixtures.ts`).
- `src/ui/`: the views, fed a `Board` value. Seam 2: test them with Testing Library via `board-fixtures.tsx`.
- `src/shell/`: thin Tauri adapters and the App wiring. Checked by hand. `refresh.ts` is the one exception, with fake-timer tests.
- `src-tauri/`: the Rust shell. `capabilities/` *is* the read-only promise; `scan_roots.rs` decides which folders may be read.

Tauri imports stay in `src/shell/` and `src-tauri/`. A test enforces it, and another keeps every capability read-only.

## Before you commit

Run `npm run check`. The pre-commit hook runs it as well, so a red commit can't land.

## Known gaps

A gap you find but leave (out of scope, a different file's bug, a race seen once) becomes a ticket: a `.scratch/<feature>/issues/NN-<slug>.md` under the Feature it belongs to, with `**Status:** needs-triage`, what you saw, and how to reproduce it. Name the file in your report. The Board then shows it, where a line in a report or story log is forgotten. `.scratch/` is gitignored, so a worktree has none: there, put the gap in your report with its Feature, what you saw and how to reproduce it, and the session that started you files the ticket in the main checkout.

## Running the app

- `npm run app` serves on port 1420.
- In a worktree, or while another agent's app is running, use a port of your own. A ticket brief names one.

  ```sh
  npx tauri dev --config '{"build":{"devUrl":"http://localhost:<port>","beforeDevCommand":"npx vite --port <port> --strictPort"}}'
  ```

  If `tauri dev` exits by itself while other apps run, start `npx vite --port <port> --strictPort` and `./src-tauri/target/debug/matt-kanban` separately. The binary must have been built with the same port override.
- Prefix log files with your ticket (`ticket07-dev.log`), because the scratchpad is shared between agents.
- When done, quit your app, vite and tray icon, and check none of your processes remain. Other agents' apps are theirs to stop.

## Checking by hand

**The desktop belongs to the developer.** Drive the app only through code:
- a start state, named by `BOARD_DEV_START` (below), rather than temporary startup code;
- an env var;
- a fixture.

Mouse, keyboard and AppleScript UI actions stay with the developer. A missed click once landed in their browser. Focus stays with the developer too: your windows open unfocused and stay behind theirs. Capture motion by freezing it at a frame (a paused animation with a negative delay) rather than bringing a window forward, since a keystroke of theirs would land in whichever window has focus.

- **Throwaway data:** `BOARD_DEV_SCAN_ROOT=<clean absolute folder> npm run app`, debug builds only. It adds that folder as the first scan root, with read and watch access, alongside the saved roots. It is never written to `settings.json`. Fill it with `npm run dev-fixture -- <folder>`: a Project with real git worktrees, built from the repo root, so it works under a worktree guard that refuses git elsewhere. `npm run dev-fixture -- <folder> worktree <name>` adds a worktree while the app runs. Edit the files to watch the Board react, then delete the folder. Pass the folder's real path (`/private/tmp/…`, not `/tmp/…`): git records real paths, and a worktree outside the scan root's spelling is skipped. A bad value is ignored with an `Ignoring BOARD_DEV_SCAN_ROOT=…` line on stderr.
- **Start state:** `BOARD_DEV_START=<state>`, debug builds only, opens the app in that state: `settings` opens the Settings window, `popover` the popover under the tray icon, and `ticket:<id>` that Ticket's detail in the Board window. A Ticket's id is `<Project folder>/<feature folder>/<NN>` for a local Ticket (the fixture's `ticket:demo/tickets/02`), `<Project folder>/#<feature issue>/#<issue>` for a GitHub one, and `<Project folder>/no-feature/#<issue>` for a GitHub one with no Feature issue; an id not on the Board leaves the Board as it opens. During such a run the app has no Dock icon and can't be brought forward; a plain run, one with only `BOARD_DEV_SCAN_ROOT`, or one with a bad value starts as usual. Combine it with `BOARD_DEV_SCAN_ROOT` to start on a fixture's Ticket. A bad value is ignored with an `Ignoring BOARD_DEV_START=…` line on stderr.
- **Real Projects** under the developer's scan roots are read-only to you as well as to the app.
- **Screenshots:** capture only the app's window with `screencapture -l <window id>`, into the scratchpad. A debug build titles its window `MattBoard (dev :<port>)`: pick yours by that title. The plain `MattBoard` window is the developer's, unless you run a README shoot (below).
- **README screenshots** (`docs/screenshots/`): fill an empty folder with `npm run dev-fixture -- <folder> showcase` (the invented Projects recipe-app, invoice-api and field-notes), and run the debug build with `BOARD_DEV_SCAN_ROOT=<folder> BOARD_DEV_SHOOT=light` (or `dark`). The shoot variable titles the Board window plain `MattBoard` and gives every window of the app that appearance; a release build ignores it, it is never saved, and a bad value is ignored with an `Ignoring BOARD_DEV_SHOOT=…` line on stderr. A shoot reads only the dev scan root, never the saved scan roots, so none of the developer's own Projects shows, and it never writes `settings.json`. Since your window is then titled like the developer's, find its id by your app's PID, not by title. Open a Ticket or show the popover with `BOARD_DEV_START`, and let the developer review the shots before they're committed.
- **The developer's list:** checks that need a click or change their machine go in your report, never done by you. These are the tray icon, popover close behaviour, Open in VS Code / GitHub, and Open at login. Test Open at login's wiring with a stub, and leave the real login item to the developer.

# Matt Kanban

MattBoard: a read-only board that shows the tickets produced by Matt Pocock's skills across every project under the folders the user picks, in one place.

## Language

**Board**:
The single view that lays out every Ticket from every Project as cards in status columns.
_Avoid_: Dashboard, tracker

**Project**:
A folder under a scan root that declares an issue tracker in `docs/agents/issue-tracker.md`; discovered automatically, never registered by hand.
_Avoid_: Repo, workspace, app

**Tracker**:
Where a Project keeps its Tickets: local markdown under `.scratch/`, or GitHub Issues.
_Avoid_: Backend, source

**Feature**:
One piece of work in a Project, under which its Tickets are grouped. It exists from its first document (an issue or a spec), so it can have no Tickets yet; it usually has a spec, but need not.
_Avoid_: Epic, spec (the spec is the Feature's document, not the Feature)

**Scan root**:
A folder the user picked, under which the Board looks for Projects. There is none until the user picks one.
_Avoid_: Workspace, home folder

**Ticket**:
One implementation issue (a `.scratch/<feature>/issues/NN-*.md` file or one GitHub issue); shown on the Board as one card.
_Avoid_: Card (the card is the Ticket's picture), task, story

**Story**:
One run of an agent loop in a Project, kept as a story file: a goal, its route through the skills, and the step it is waiting on. Optional: a Project need not have any. Shown in the sidebar while it is mid-step; never shown as a card.
_Avoid_: Session, handoff

### Ticket states

**Blocked**:
A Ticket not yet Done, Won't fix or Your turn that names at least one blocker which is neither Done nor Won't fix.
_Avoid_: Waiting, on hold

**Ready**:
A Ticket not yet Done, Won't fix or Your turn whose blockers are all Done or Won't fix (or which has none): one an agent can pick up.
_Avoid_: Todo, open, in progress

**Your turn**:
A Ticket whose status is `ready-for-human`: the agents are finished with it and the next step is the developer's (checks, a CI run, an upload, or building it by hand). It still blocks the Tickets that name it as a blocker.
_Avoid_: Needs human, awaiting review, in review

**Done**:
A Ticket whose status is `done`, or whose GitHub issue is closed.
_Avoid_: Closed, finished, resolved

**Won't fix**:
A Ticket deliberately dropped; hidden from the Board unless asked for.
_Avoid_: Cancelled, rejected

# app/src/components/team-view: design decisions

Covers `app/src/components/team-view/`: an employee's Tasks, routines and team move surfaces. File paths in this record are relative to that folder.

## Tasks section: archive is a mode, one sweep

An employee's Tasks section shows its active board or its archive; the flag lives in `TeamMissionControl` so exactly one is mounted. Both read the single `all-conversations` query over the full workspace roster (the one-sweep rule) and narrow through `MissionControlScope`. Which surface owns a published target is decided from the raw sweep rows, never a board's own items: an archived target moves to the archive, an active one back to the board. "New task" from the archive opens the composer on the active board. The section is keyed on the employee id so switching employees starts a clean selection; each employee keeps its own draft scope.

Lives in `app/src/components/team-view/team-mission-control.tsx`, `team-archived.tsx`, `team-mission-board.tsx`, `use-agent-board-scope.ts`.

## Phone tasks live on the AI Employees tab

On phones the employee's Tasks is the task list in the AI Employees drill-in, so a phone landing on this screen's Tasks (resize, restored entry) is moved there. Tabs replace rather than push so back leaves the employee's screen. Returning to the task list recognises the drill-in entry by its address, because `retreat` compares whole entries and the drill-in entry carries prior screen fields; elsewhere the screen is replaced by the list so back never no-ops. Phone titles map every `TeamSectionId` exhaustively so a new section is a compile error.

Lives in `agent-view.tsx`, `agent-settings-pane.tsx`, `agent-chrome.tsx`, `team-section-tabs-model.ts`, `open-phone-task-list.ts`.

## Routine chat is a request/report child per owner

The routine chat reuses the per-agent machinery verbatim (`useRoutineChatSetup`, `useRoutinesTabView`, `RoutinesTabPane`). Those hooks read one agent and hooks cannot be called per row, so the section mounts a child per owner (keyed by agent id) and drives it with a one-way idempotent request, reading back a report. Each request object applies once, because `handleOpenChat` is a toggle whose identity changes with every selection. The child never reports the empty frame before the request lands (the parent reads `null` as closed), except for a `pending` request that resolves to nothing, which must be reported so the host does not keep an invisible panel open. The report moves the highlight from draft row to routine row as setup completes. The chat portals into the one shared shell panel, and only the on-screen employee view may claim it, since several kept-alive screens are mounted at once. Re-clicking an open routine row closes it; re-clicking a draft row does not, since the chat is all the draft row is.

Lives in `team-routines/team-routine-panel.tsx`, `team-routines/use-team-routine-host.tsx`.

## Pending routine chat notifications

A session-finished notification names the owning agent and the activity. This section mounts that employee's chat host with a `pending` request; a target for another employee stays armed for that section, and one for an employee no longer in the roster is dropped.

Lives in `team-routines/use-pending-team-routine-chat.ts`.

## Drafts are rows

A routine being built in chat exists only as an unclaimed setup activity, invisible to routine reads; without draft rows a routine started here would vanish when its chat closed. Drafts use `findDraftSetupActivities` and the same `activityQueryOptions` key the board uses.

Lives in `team-routines-model.ts`, `team-routines/use-team-routine-drafts.ts`.

## Routine reads and failures

Reads use the shared query keys so routine event invalidation refreshes them. Failures are never swallowed: the list renders what answered, one strip names what did not, and retry refetches only the failed reads (resolving with the outcome rather than rejecting). A runs failure degrades rows (no last run, no stop action) so it counts. Trigger health is read only when the employee has an event routine, because rows with a trigger binding show "Verifying" until a status arrives. If nothing answered, the empty state does not claim there are no routines and the create button is dropped in favor of Retry. Schedules wait for the account timezone read; the footer shows that zone and is the only place to change it.

Lives in `team-routines/use-team-routines-data.ts`, `team-routines/use-team-trigger-statuses.ts`, `team-routines/use-team-grid-labels.ts`, `team-routines/team-routines.tsx`, `team-routines/team-routines-footer.tsx`.

## Routine actions

Edits, deletes and run controls are optimistic and roll back with their hook's toast. Discarding a draft is awaited and toasted here, because the activity update throws "Activity not found" outside `call()`. A locked org refuses routine writes up front. Inline cron edits use the same update route (`schedule` clears any trigger binding server side) and the saver's plan floor. Manual runs are the analytics signal for usage.

Lives in `team-routines/use-team-routine-actions.ts`, `team-routines/team-routines-grid.tsx`.

## Create button placement

The header hides the create button when the grid's empty state carries it, since two identical filled pills are the same act twice; one draft row ends the empty state and returns it. In strip form the header omits the "Routines" title because the lit tab already says it.

Lives in `team-routines/team-routines-header.tsx`, `team-routines/team-routines.tsx`.

## Strip width threshold

The team strip goes to one row at 1060px of its own width: widest team cluster about 521px, heaviest tools cluster about 474px, 40px padding and a 12px gap give 1047, rounded up.

Lives in `team-chrome-layout.ts`.

## Files toolbar focus

The New folder menu item must not let the menu restore focus to its trigger: that blurs the autofocused inline input, whose blur-cancel kills the creation. Desktop offers opening the folder in the OS file manager; browser builds offer a whole-tree download. Uploads and these actions are absent while the org is locked. Each employee's Files shows one agent's real tree, never a merged filesystem.

Lives in `team-files/team-files-toolbar.tsx`, `team-files/index.ts`.

## Team move

A failed move reports how many agents actually moved, since the run stops at the failure. A seat the move flow cannot pay for fails the invite row; seats are bought on the People tab.

Lives in `team-move-flow.tsx`, `use-team-move-invites.ts`.

## Settings nav store

A one-shot request opens a focused agent's settings on a section; `shown` reports the section on screen for "already there" checks; `apiAccessFor` is keyed on the agent so the AI Manager's card can land on API access without landing inside another employee's screen.

Lives in `agent-settings-nav-store.ts`.

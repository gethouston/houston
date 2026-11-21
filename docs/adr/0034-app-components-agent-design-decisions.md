# app/src/components/agent: design decisions

Covers `app/src/components/agent/`: an employee's own surfaces: sharing, skill setup chats, automations, webhook keys, files, access and learnings. File paths in this record are relative to that folder.

## Share surfaces

`agentShareSurface` picks one of four: `manage` (a multiplayer team space where the caller manages the agent: the Drive-style dialog), `inviteTeam` (a personal space on a spaces host: personal spaces are not invitable, so Share offers to move the agent into a team; this wins over `manage` because the team dialog's `addOrgMember` 403s `personal_space`), `view` (a member who can see but not manage: a read-only people list), and `none` (desktop and self-host). The Share block requires both multiplayer and manager authority, because `canManageAssignments` alone returns true in single player and would show an empty share surface on every self-host agent. One mapping renders the surface for both the header button and the settings block so they never diverge. The gateway is the real enforcer.

Lives in `app/src/components/agent/agent-access-model.ts`, `agent-share-surfaces.tsx`.

## The everyone sentinel

A present but empty assignee set means shared with the whole org (what `setAssignments` writes for "Everyone on your team"); single-player agents have no assignee fields at all. Every reader goes through `isSharedWithEveryone`; ignoring it makes an org-wide agent read as owner-only and silently narrows access on first edit. `buildSharePeople` expands it to every member, always includes org owners, and sorts owners, managers, members. Only org owner/admin can be made a Manager (`manager_requires_admin`). The owner is never stripped. Removing or demoting oneself is confirm-gated.

Lives in `agent-access-model.ts`, `agent-share-dialog.tsx`, `agent-share-person-row.tsx`.

## Non-managers see a truthful subset

The gateway withholds the assignee roster from non-managers. The read-only view always appends the viewer, since an agent a member can see was shared to them. For the same reason, "is this a shared agent" returns true for a plain member, whose assignee count would read 0.

Lives in `agent-access-model.ts`, `agent-share-people-dialog.tsx`.

## Share analytics measure widening

`agent_shared` fires only when the resolved roster gains someone. Comparing raw lengths fails because the broadest share is the empty array and materializing it grants nobody anything. Level changes are not widening. Share writes are optimistic on the agent store with rollback, then reload so the server's shape wins.

Lives in `agent-access-diff.ts`, `use-share-agent.ts`.

## Move into another org: order is law

Pick, confirm, move (poll to `done`), switch the active space, then invite. `addOrgMember` targets the active space, so the switch precedes invites. Completion is read from the poll route, never the event stream. An accepted move is recorded before polling so a closed dialog or quit resumes at boot. A move that never answers becomes a retryable failure (a wall-clock ceiling). A destination missing from the reloaded list never advances. Every switch settles the agent store before completing. If the switch fails after a successful move, the flow stops rather than invite into the personal space. Team creation (`POST /v1/orgs`) is not idempotent, so a failure reconciles against a fresh list before retry. `already_member` is shown inline only. A seat the flow cannot pay for fails the row; seats are bought on the People tab. In store apps an out-of-trial team reads as a plan limit, never an upgrade prompt.

Lives in `share-via-team-flow.tsx`, `use-agent-org-move.ts`, `use-share-invites.ts`, `use-share-create-team.ts`, `share-via-team-failed-steps.tsx`.

## Setup chats (routines, skills, custom integrations)

A setup chat is a real mission tagged with a sentinel so no board shows it; its only home is the shell panel. All three share `RoutineSetupChatBoard`, whose `composerOverride` renders the ask_user cards the interview depends on. Setup chats always run as Ask first, because the interview needs ask_user (auto strips it) and must never open read-only in Planner. The kickoff pins the agent's configured model, effort and mode through `readAgentRunOverrides`, gated on the providers the user actually connected (`connected` is required; `null` defers to the stored provider), because an unpinned send lands on the runtime default. The kickoff prompt is built after create since the agent writes the activity id into `setup_activity_id`. A start in flight never double-creates. `createMission` does not go through `useCreateActivity`, so callers refetch. Failures surface via `call()`, not extra toasts.

Lives in `use-routine-chat-setup.ts`, `use-skill-chat-writes.ts`, `use-skill-chat-setup.ts`, `routine-run-overrides.ts`, `routine-setup-chat-board.tsx`, `routine-setup-chat-board-props.ts`.

## Shared shell panel claims

Setup chats portal into the one shell panel and claim it only while their host screen is on screen, because both hosts are kept-alive views and an ungated claim holds the panel open over other screens. The board's own list is hidden; only its portaled detail panel shows. `sessionKeyFor` is a stable callback because AIBoard keys composer autofocus on it, and an inline arrow refocused the composer on every re-render. A chat opening beside a form the user is typing in does not take focus. Escape: a focused composer takes the first Escape to blur, the panel the next; Radix-handled Escapes are left alone.

Lives in `skill-setup-chat.tsx`, `routine-setup-chat.tsx`, `routine-setup-chat-board.tsx`.

## Chat and entity links heal in both directions

A routine or skill claims its chat by `setup_activity_id`; the chat carries a durable reverse stamp (`routine_id` or `skill_slug`) because agents rewriting `routines.json` can drop the forward link and agents never rewrite `activity.json`. Background heals repair one link per pass and only log on failure (the next refetch retries). A skill chat whose link write fails is archived so it never lingers as a bogus draft. An agent that forgot the forward link is caught by a claim fallback: while the user sits in a draft, the one new unlinked skill is this chat's creation. Draft rows wait for the agent's own activity list, because a cold open serves the cross-agent cache whose rows lack `skill_slug` stamps. A skill chat's title follows the skill's title. The client never rewrites SKILL.md.

Lives in `use-routine-chat-heal.ts`, `use-skill-chat-setup.ts`, `use-skill-setup-view.ts`, `use-skill-chat-writes.ts`.

## Org skill by default

When an agent creates a skill in its create chat (the forward-link stamp moment, once per creation), on shared-store deployments the skill moves to the workspace store and installs to that one agent. The list-delta claim fallback and orphan adoption deliberately do not share, since a store install during the chat could satisfy the heuristic. While capabilities load the share is attempted anyway, because the claim is one-shot; the wire's 404/503 declines quietly and only explicit `sharedSkills: false` skips. Caches the merge reads are refreshed before the compare-and-delete, or the delete's refetch would deselect the open chat. Multiple mounted observers dedupe on a claim key.

Lives in `use-org-skill-default.ts`.

## Every send re-asserts the bound skill

A skill chat prepends hidden model context naming its skill on every send, because the model was observed asking "which skill?" inside a skill's own chat.

Lives in `skill-setup-chat.tsx`.

## Routines section state

Selection is `null`, `intake`, `routine` (its own screen, replacing the list, never a side panel), `routineChat`, `runChat` or `draft`. A row click opens the routine screen, never straight into chat; a re-click closes it. A cursor for a routine that vanished is dropped, but only against a loaded list. Draft-to-routine claim swaps to the routine's chat so the same conversation continues. Late starts adopt their id only if the user is still waiting. Notification targets for another agent are left alone; a target is cleared only once both sources load with no match. A run's chat uses a synthetic activity over the run's session key, reconstructed from the routine's chat mode when the run record was pruned by the 50-run cap.

Lives in `routines-tab-model.ts`, `use-routines-tab-view.ts`, `routines-tab-pane.tsx`, `routine-screen.tsx`.

## Automation intake

"New routine" opens the setup chat at once with scripted cards over the composer that look exactly like ask_user cards (same `ChatInteractionCard` shell and labels) but make no model calls. Typing in the composer abandons the cards and hands the text over as intent. Skipping any question completes with nothing and the AI interviews. The trigger step only picks the app and pins an account when there are several; the setup chat picks the event in plain words, so the step fetches the event catalog in the background and the CTA waits on it (a failure shows inline retry). Webhook addresses and secrets are minted later from the chat header, never in the intake. Templates resolve schedules with the same `cronSummary` the schedule card uses, injected to keep the module free of React. Where event triggers are unavailable, the wake question is skipped and the app-event template dropped. Large catalogs (unrestricted hosts) hide behind search. Inline connects for custom integrations use the agent-scoped form, since the top-level read 404s at the gateway.

Lives in `automation-intake/`.

## Trigger status never spins forever

A trigger routine with no status past a verification timeout gets a synthesized error; a real status always wins. One hook (`useTriggerStatusTimeouts`) serves both the grid and the routine screen's chip, because the chip once had no timeout and a moved agent's webhook showed "Checking" across restarts. A timer forces one re-evaluation at the earliest pending timeout. Polling continues while any trigger is unsettled and stops once settled; `paused_*` waits on the user. Only agents with an event routine are asked about trigger health. `triggersEnabled` gates only offering new triggers; existing routines always show health. Remedy copy replaces the host's English `detail` so `ui/` never reads the reason. Reconnect routes to the global Integrations page because broken triggers are fixed at the connection. Webhook `pending` maps to "Create webhook address", not a spinner.

Lives in `routine-trigger-maps.ts`, `use-trigger-status-timeouts.ts`, `trigger-status-view-model.ts`, `trigger-remedy-detail.ts`, `routine-activation-chip.tsx`, `routine-activation-alert-view.ts`.

## Webhook keys

Only the routine's creator (or the space owner for a routine with no creator) may mint or rotate, matching the gateway's `webhookKeyAccess`; others see whether a webhook exists and who can change it. While access is unknown the chip shows state only. Rotation is confirmed because it invalidates the old secret. The secret lives only in the chip's local state, never the query cache, and is cleared on close. A host too old to mint returns null.

Lives in `webhook-activation-chip.tsx`, `webhook-chip-view.ts`, `webhook-key-dialog.tsx`.

## Routine model and health

The model row always names the resolved provider and model, since "Agent's model" told the user nothing about which account would run and bill. Pins are stored in pi's canonical dialect; `null` clears the pin. Health is scoped: `/providers` answers for the viewer's credentials while a fired routine runs on its creator's, so a teammate's routine gets a sentence instead of a badge, and the row warning chip shows only for the viewer's own routines. Auto-paused and plan-held routines outrank a live health probe. The row informs and never blocks saving.

Lives in `routine-model-selector.tsx`, `routine-model-row.tsx`, `routine-warning-chip.tsx`, `routine-provider-health-badge.tsx`.

## Routine notices

Plan-skip, auto-pause and snooze notices come from SDK decisions (`triggerPlanSkipNotice`, `routinePauseNotice`, `routineSnoozeNotice`). Store apps never sell, so Upgrade is dropped there. Actions that leave run `onLeave` first so a hosting dialog closes before another opens. The plan-skip notice reads the same trigger-status cache as the chip without its error toast. Resume on an auto-pause is quiet because resuming before the fix only fails again. Run failure codes and remedies map to literal `t()` keys rather than template keys so typos fail typecheck. A signed-out account reads as "sign in again".

Lives in `routine-plan-skip-notice.tsx`, `routine-plan-skip-notice-view.tsx`, `routine-plan-skip-notice-controls.tsx`, `routine-auto-pause-banner.tsx`, `routine-snooze-banner.tsx`, `routine-runs-dialog.tsx`.

## Provider auth detection in the chat feed

The TS runtime refuses a turn without a credential with fixed strings ("No provider connected...", "No local model configured...") and emits no `AuthRequired` event, so these feed messages are the only signal for the in-chat reconnect card. Status code patterns match on word boundaries, because a bare `includes("401")` matched inside a UUID echoed from a setup prompt and hid a whole reply. Tool results never count, and model words count only from turns where the model never ran (thinking or a tool call proves it is signed in).

Lives in `provider-auth-feed.ts`.

## Files

One hook (`useAgentFiles`) owns the read, every mutation, capability gates, labels and overlays for an agent's Files, so there is one answer to every file action. The tree reads `queryKeys.files(agentPath)`, the same cache entry `FilesChanged` invalidates. Whether the OS can open files is one answer: the host-reported real path on co-located TS hosts, never `folderPath`, which is a route key on the TS engine; without it the surface previews in app and offers downloads. Drag-move and folder upload need the TS host's routes. A locked org refuses writes but keeps reading and downloading. Deletes are confirmed, naming a single target or counting a selection, with separate folder copy; the target outlives close so copy holds through the exit animation. Uploads drop hidden files, refuse over-large batches loudly, and upload the valid files while naming oversized ones. The OS picker reports late, so the open folder rides in a ref; `webkitdirectory` makes a folder picker. The preview takes no comments here because Files belongs to no conversation.

Lives in `agent-files/use-agent-files.tsx`, `agent-files/agent-files-capabilities.ts`, `files-delete-confirm.tsx`, `files-delete-copy.ts`, `files-upload-intake.ts`, `files-upload-pickers.tsx`.

## Access ceilings

Model ceilings are a flat set of provider-native ids (`null` allows all); toggling a model flips all its offers and leaves unknown ids alone, which still count so a stale ceiling reads as a restriction. Empty states distinguish nothing picked from a lab filter hiding picks. The access choice is a segmented radio group with roving tabindex where focus follows selection, named by the visible heading; re-selecting the current option is a no-op so it never reseeds. Editors are keyed by agent so view filters never leak across agents, and own no width.

Lives in `agent-admin/model-allowlist.ts`, `agent-admin/access-choice.tsx`, `agent-admin/agent-admin-model.tsx`, `agent-admin/agent-admin-integrations.tsx`.

## Job description editor

Facts (industry, role) and free description are read from the same query and recomposed over the current text, so a row pick never overwrites prose and a prose save never overwrites facts; agent rewrites appear live. A failed read offers retry rather than spinning.

Lives in `agent-admin/agent-admin-instructions.tsx`.

## Learnings

Writes paint before landing and are not awaited; an add or edit resolving `false` reopens the editor with the typed text. Provenance shows the teacher's face (multiplayer only) and the live mission title, falling back to stored values.

Lives in `learning-card.tsx`, `learnings-content.tsx`, `agent-admin/agent-admin-knowledge.tsx`.

## Usable trigger apps

Usable means active connection intersected with the agent's effective allowlist (`null` is unrestricted). Connectable apps are the allowlist intersected with the catalog, minus connected.

Lives in `use-usable-toolkits.ts`.

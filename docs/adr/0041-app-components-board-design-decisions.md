# app/src/components/board: design decisions

Covers `app/src/components/board/`: the mission board shell: sources, selection, drag, drafts, archive and the wide chat. File paths in this record are relative to that folder.

## One board, one injected source, one sweep

`MissionBoard` owns every board-shaped concern (columns, multi-select, keyboard, shell panel portal, AIBoard props) and takes data, active agent, new-mission flow and bulk routing from a `BoardSource`. Mission Control and every employee board are the same source narrowed by `MissionControlScope`, so they cannot drift. `scopePaths === undefined` means every agent; an array (even empty) means only those paths. The cross-agent sweep always spans the full roster so every board reads the one warm `all-conversations` query. The chat half is `useBoardChatWiring`, shared with the phone's pushed chat. The board is desktop only; phones use the employee task list.

Lives in `app/src/components/board/board-source.ts`, `mission-board.tsx`, `mission-control-scope.ts`, `use-mission-control-source.tsx`, `use-board-chat-wiring.tsx`.

## Kept-alive boards: only the board on screen registers

Several kept-alive boards are mounted at once, so arrow navigation, Enter, the New task shortcut, the empty auto-open and the shell panel portal register only from the board on screen; unconditional registration is last-writer-wins and a hidden board would own them. The inactive path returns without cleanup on purpose: React runs every destroy pass before the create pass, so the outgoing board nulls the handler before the incoming one claims it, and nulling from the inactive path would clobber the new claim. Going off screen releases the empty new-task composer (via AIBoard's closer, since its state lives inside AIBoard), the open mission and the panel claim; skipping the composer once left `showPanel` stuck true. The archive, which is not a `MissionBoard`, releases the panel itself.

Lives in `use-board-keyboard.ts`, `use-mc-new-mission.tsx`, `mission-board.tsx`, `mission-control-archived.tsx`.

## Navigation targets: owner surface and on-screen only

Every "open this mission" navigation publishes `activityPanelId`. Only the board on screen may consume it, and only the surface (active or archive) the raw sweep rows say the target belongs to. That second guard lives in the consumer, not the owner, because React runs child effects before parent effects: the active board would otherwise consume and clear an archived target before the surface router could swap in the archive, opening a dead chat. The owner (`useBoardSurfaceOnNav`) swaps surfaces for arrivals and resets to the active board when the board comes back on screen (false to true edge only), since the archive is somewhere you go, never somewhere you are returned to. A passive navigation never yanks the user out of an open conversation or composer; an explicit one may.

Lives in `use-pending-mission-target.ts`, `use-board-surface-on-nav.ts`, `use-mission-control-source.tsx`, `mission-control-archived.tsx`.

## Open conversation identity

On a cross-agent board the session key and agent path come from the selected card. Two cases have no card: a mission just created whose row the sweep has not returned (held by `useJustCreatedMission`, including missions created outside the board and published through `lib/created-mission-handoff.ts`, dropped once the real row lands), and a card transiently missing from an older sweep snapshot, where the identity last resolved for the same selection keeps the chat painted. Deletes and archives clear the selection explicitly, so the fallback never resurrects a closed card. The panel's task line is blank, not "New task", while a selected card resolves.

Lives in `use-mc-open-conversation.ts`, `open-conversation-identity.ts`, `use-just-created-mission.ts`, `panel-task-label.ts`.

## Card identity comes from the roster

A card's agent name and color come from the roster by `agent_path`, because on the web build the row's `agent_name` is stamped from the adapter's own registry, which does not know host agents and fell back to "Houston". The row name is only a fallback for paths the roster lacks. Skill and attachment markers in the first message are decoded, never shown raw. Guided setup chats never become missions.

Lives in `mission-card-agent.ts`, `use-mission-control-archived.ts`, `archived-mission-filter.ts`.

## Writes paint in the click's frame

Every user-initiated mission write uses `optimisticWrite`: the card moves, leaves or renames now; only a refusal is visible later, restoring the card with one toast. The promise never rejects, so no handler awaits it. Single-card writes re-read only the agent's own list and leave the aggregate to the agent's event, to avoid waking every pod. Bulk writes group by owning agent (each bulk route is single-agent), roll back the whole batch on any refusal, and drop ids whose agent cannot be resolved. A card's unsent draft is deleted only after the host confirms the delete. Conversation keys are read before the patch, since afterwards no cache names them. Attached files stay in uploads.

Lives in `mission-writes.ts`, `use-mission-card-writes.ts`, `use-cross-agent-selection.ts`, `group-ids-by-agent.ts`.

## Celebrations

Signing a mission off (checkmark, drag to Done, bulk move) celebrates with the paint; failed missions move without fanfare; a bulk batch celebrates when at least one succeeded. Archiving never celebrates.

Lives in `use-mission-card-writes.ts`, `use-mc-actions.ts`, `use-board-bulk-actions.ts`.

## Selection lock

A multi-selection never spans sections. The lock derives from the whole selection, and a selection that splits becomes a sentinel that matches no column, so checkboxes hide until cleared. Deselect is always allowed. "Select all in column" clears first because `selectAll` skips the per-card guard. Column ids come from the unsearched set. A bulk removal covering the open chat closes it explicitly, since the panel stays open across other churn.

Lives in `use-board-selection-ui.tsx`, `board-selection-model.ts`, `use-board-bulk-actions.ts`.

## Drag rules

A card drops only on needs_you or done and never its own section; it keeps its agent and only its status moves.

Lives in `use-mc-actions.ts`.

## New task target

A pinned agent wins, else a single scoped agent, else a menu hung off the button (not a modal, which stopped the world and covered the rail). The modal picker remains only for an empty board's auto-open, which has no button. A board pinned to one agent never asks. The empty auto-open fires once per scope, only on screen, never during a search, and never while an Academy lesson teaches the click. A seeded composer (`composeTaskFor`) keeps its words; manual opens wait for the seed to end, and the seeded open does not focus the composer so sending stays deliberate.

Lives in `new-mission-target.ts`, `use-mc-new-mission.tsx`, `use-board-keyboard.ts`.

## Send pin

Every composer send carries the provider, model and effort the picker shows (pooled cloud turns read effort from the send alone). `resolveSendPin` replaces the captured pin at send time so a send fired while the composer resolves uses the settled pin. All surfaces build overrides through `composerSendOverrides` so effort cannot fall off one surface. A new conversation's first message waits for the settled pin like a follow-up. Mentions are per send.

Lives in `composer-send-overrides.ts`, `use-board-send-queue.ts`, `use-board-chat-wiring.tsx`, `board-source.ts`.

## Warming agents park sends

A send into a warming or asleep pod parks in the warming queue, rendered now and delivered on ready; a held wire send would die to infrastructure timeouts or a reload, and waiting would freeze the composer. The flush re-reads the row's own pin. A parked send flips a queued row back to running. Queue-while-running lives in the engine adapter. The engine owns the status flip to running; the UI never pre-writes it. The turn stream pushes the user bubble into the VM; there is no app-side optimistic push. A failure before a turn stream exists toasts. Context-prefixed prompts persist the user's words as the bubble.

Lives in `board-send-message.ts`, `board-create-conversation.ts`, `use-board-send-queue.ts`.

## Session loading rollup

A session is busy whenever its activity row is running, not only when this surface sent it, so Stop stays live for turns started elsewhere. A surface with no board (`rawItems: undefined`, the assistant) has no row to settle it, so its VM alone starts and ends the spinner; an empty board (`[]`) still expects a row. `wrapping_up` ends the spinner before the card leaves running. The open conversation follows its own turn even when started elsewhere. Stop refetches so an orphaned running activity that the engine settles clears.

Lives in `session-loading.ts`, `use-agent-board-send.ts`, `use-mc-actions.ts`.

## Drafts

The board holds the draft store, not the text, so keystrokes re-render only the composer. AIBoard keys the new-mission draft with a literal, but the store scopes it per agent and per board so a first message parked for one agent or board never surfaces in another. Typing prewarms the sandbox and hands the new chat its prewarmed conversation id.

Lives in `use-board-drafts.ts`, `mission-control-scope.ts`, `use-composer-prewarm.ts`.

## Archive

The archive is a mode of Tasks. It always receives the full roster for the sweep and narrows with `scope`. Sending in an archived chat reactivates it (the engine flips archived to running) and hands off to the active board with the chat open. The handoff uses the agent latched while the mission was still listed, because the list refetches without it after reactivation. Archived chats show only offers they finished with, never a blocking stepper. It claims only archived targets.

Lives in `mission-control-archived.tsx`, `use-mission-control-archived-panel.ts`, `use-mission-control-archived-send.ts`, `use-latched-mission-agent.ts`, `use-archived-chat-props.tsx`.

## Filters and scope

A filter pointing outside the scope resolves to every agent rather than an empty board; a path no agent owns is not treated as an agent. The person filter runs after the agent filter and before search, and its roster comes from agent-filtered items so every person stays reselectable. The first-day offer counts tasks before search and filters.

Lives in `mission-control-scope.ts`, `use-mc-scope.ts`, `use-mc-person-filter.ts`, `use-mission-control-source.tsx`.

## Wide chat

A mission chat may go wide; the board steps out of the layout and the header leads with a named way back ("Back to tasks", or "Back to archived") instead of an X, which must run AIBoard's closer. A file preview beside the chat also makes it wide. The width preference (`chatWide`) is one persisted value; only surfaces that opt in honor it. The toggle's name changes with state, so no `aria-pressed`.

Lives in `panel-width-controls.tsx`, `mission-board.tsx`, `archived-mission-board.tsx`.

## Phone task list

The status filter is a narrowing of one sectioned list; only Needs you shows its count. Search and Archived sit behind the "..." menu, since a permanent field would take the first line and the archive is a deliberate act. The toolbar's one-row or two-row form is the strip's call.

Lives in `task-list-filter.tsx`, `task-list-menu.tsx`, `task-list-model.ts`, `mc-toolbar-slot.tsx`.

## Labels

`ui/` is i18n-agnostic, so the app always passes the panel task line and composer copy; the assistant's composer copy does not mention "the AI Employee".

Lives in `panel-task-label.ts`, `board-labels.ts`.

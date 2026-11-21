# app/src/stores: design decisions

Covers `app/src/stores/`: the app's Zustand stores: workspaces and spaces, cloud migration, provisioning, connect flows, navigation, drafts, toasts and layout preferences. File paths in this record are relative to `app/src/`.

## Cloud migration runs agents sequentially behind a local backup

`~/.houston` is copied aside before anything is touched, so a crash mid-upload cannot lose the only copy. Agents migrate one at a time so a large install does not stampede the gateway. Crash recovery is server side: the gateway stamps a per-agent import marker, so a re-run skips landed agents. Re-invoking the source host spawn is the idempotent recovery when it died. A failure after "Migrate later" is treated as abandoned, not broken.

Lives in `stores/cloud-migration.ts`, `stores/cloud-migration-finish.ts`.

## Active space switch drops the whole query cache

The gateway is re-pointed to the selected space before any refetch, then the cache is cleared, because `invalidateQueries` would leave inactive queries' data from the old space in cache.

Lives in `stores/workspaces.ts`.

## Workspace load state

`loaded` stays true across later retries and `loadError` distinguishes a failed load from an empty one. An identity change resets the store to its initial loading state so the splash shows instead of a stale list.

Lives in `stores/workspaces.ts`.

## Team-space delete has two shapes

Optimistic only when the caller pre-checked that the gateway will accept the delete; otherwise server first. In-flight deletes are filtered out of every re-list until the server confirms.

Lives in `stores/workspace-delete.ts`, `stores/workspace-refresh-apply.ts`.

## Workspace locale writes are sequenced per workspace

Only the newest pick may change the UI; superseded writes change nothing.

Lives in `stores/workspace-locale-writes.ts`.

## Agent provisioning entries mutate in place

An entry's identity is its live probe's exit switch, so entries are never replaced. A version counter notifies subscribers. A cold start past the TTL flags the entry once and keeps waiting, so a visible mission never disappears on its own. Entries are mirrored to localStorage and rehydrated after a relaunch (hosted profile only), with a re-anchored TTL, and queued bubbles are re-rendered.

Lives in `stores/agent-provisioning.ts`, `stores/agent-provisioning/lifecycle.ts`, `stores/agent-provisioning/state.ts`.

## Roster writes are optimistic with holds

Rename, colour and delete paint at once and a refusal restores the row. Holds keep a paint over any roster that reaches the store while the write is in flight. A rename changes the folder, the path and the id, so the host's record replaces the row.

Lives in `stores/agents-writes.ts`, `stores/agent-roster-holds.ts`, `stores/agents/state.ts`.

## Connect flows are keyed by scope-qualified flow key

There is one connect-flow state for the whole app. Records are keyed by toolkit slug qualified by scope, and the origin row is stored because the catalog renders some apps twice. Identity changes cancel every flow silently.

Lives in `stores/connect-flow.ts`.

## Interaction drafts live in their own slice

The board subscribes to the whole draft map, so parking a half-walked card there would repaint every tile. A pending interaction has no id; its identity is its full canonically serialized wire content.

Lives in `stores/interaction-drafts.ts`.

## Shell detail panel is derived from owner claims

Several surfaces render the panel and all stay mounted while hidden, so the panel's open state is derived from the set of claiming surfaces, never set directly. Only open and close transitions are navigation.

Lives in `stores/ui/panel-slice.ts`.

## Navigation actions set view and level together

Every navigation that is not the chat closes the pushed chat and the file preview. Settings, mobile Agents home and phone chat navigation are single calls that set the view and drill level together. A fresh nav stack array is created on reset because waiters watch its identity.

Lives in `stores/ui/nav-state.ts`, `stores/ui/nav-slice.ts`, `stores/ui.ts`.

## Toasts coalesce

A repeated toast bumps a counter and restarts its countdown instead of stacking. Timers are cancelled before an identity reset.

Lives in `stores/ui/toast-slice.ts`, `stores/ui.ts`.

## Only durable layout preferences persist

Everything else in the UI store is ephemeral and must not survive a reload or identity change.

Lives in `stores/ui.ts`, `stores/ui/state.ts`.

## Drafts are scoped per agent

The new-conversation draft key is scoped per agent; a seeded draft lives in its own slot so the user's parked words are untouched.

Lives in `stores/drafts.ts`.

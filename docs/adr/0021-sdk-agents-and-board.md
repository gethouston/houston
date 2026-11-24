# Agents, the mission board and conversation lists

These SDK modules hold the agent list, each agent's board of missions, its conversation list, mission search and agent data migration: `agents`, `activities`, `conversations`, `missions-search` and `migration` under `packages/sdk/src/modules/`.

## Reactive lists and how they stay fresh

`agents`, `activities` and `conversations` publish scopes (`agents`, `activities/<agentId>`, `conversations/<agentId>`), each republished whole on every change. Their writes mutate and then refetch, with no optimistic update, so the snapshot always reflects the server. The same handler backs the typed facade and `dispatch`.

- **Last intent wins.** Each module stamps loads with a per-agent `loadSeq` and publishes a result only while it is still the newest. Without it, a rename that ends in a load and races a manual refresh would let the earlier request's pre-rename rows land last and overwrite the fresh snapshot. The providers module uses the same guard.
- **First snapshot is async.** The store stays untouched at construction, so a subscriber reads `undefined` until the first real load. A connect refetch that wins first skips the loading snapshot.
- **Background refetches are quiet.** A refetch driven by the event stream is not a person's action. A transient failure is logged and leaves the snapshot stale until the next event; a 401 still reaches the auth-expiry notifier. In `activities`, `refresh` with `silent` skips the `loaded: false` republish so a background tick never flashes the board to loading.
- **Two event subscriptions, on purpose.** `agents/events-stream.ts` reads `/v1/events` for `AgentsChanged` and `activities/events-stream.ts` reads it for `ActivityChanged`. Both run on the shared `streamGlobalEvents` loop from `@houston/runtime-client`, so the reconnect machinery is reused and only a second cheap connection is added. Every reconnect refetches, so events missed while the stream was down are caught up. An `ActivityChanged` frame without an `agentPath` refetches every loaded agent rather than missing one.
- **`reactivity: false`.** A host that owns its read model (the web adapter) gets `list` (read, publish nothing) and `writes` (the wire call without the refetch, returning the wire entity), and no event stream is opened. `dispose` is then a no-op.

## Agent create and names

- `AgentCreateInput.config` is folded into `seeds` as the config document (`withInitialConfigSeed` in `agents/http.ts`), so the create body stays the one every host and gateway already honors. `JSON.stringify` drops undefined optionals, so a `{ name }` create posts exactly `{ name }`. A surface with its own colour overlay leaves `color` out; one without an overlay sends it so the agent is born coloured. `migration: true` lets the desktop-to-cloud move keep a name that is the AI Manager's reserved one.
- `isAgentNameTaken` (`refusals.ts`) compares names as the folder they become (`sameAgentName`: trimmed, NFC, case-insensitive). A 409 with no code also reads as name-taken so a server that omits the code still gets the authored copy; a 409 with any other code stays a failure. `isAgentNameReserved` keys on `name_reserved` alone, which a stale local list can lead to even though surfaces pre-check `takesReservedAgentName`.
- `requireColor` (`library.ts`) refuses an unknown palette id because the host rejects one rather than clamping it.

## First day

A new hire is born with its first day pending, and `agents/first-day.ts` is the one way it starts, for every surface and the AI Manager. The host creates the task, fires its first turn and records the start in one operation under the employee's lock, so a repeated start returns the same task with `outcome: "existing"`. That is why this start, unlike other writes, rides out a pod that is still coming up: it is offered the moment the agent exists, often before its pod answers, and repeating it is harmless.

`first-day-refusal.ts` (published as `@houston/sdk/agents/first-day-refusal` for the app's `node:test` runner, so erasable syntax only) reads the 409 `FirstDayRefusalCode` from both the adapter's and the SDK's errors. `first_day_no_provider` is expected: the surface offers the connect flow, and the first day stays pending. `first_day_not_pending` means another tab or the AI Manager already started it; the config refetch removes the stale button. `first_day_provider_unavailable` means the provider failed a token refresh for the first turn: transient, the first day stays pending, and the surface asks the person to try again. The start re-issues a waking refusal because the host is idempotent, but never this one: its `Retry-After` is about a minute and an earlier retry only reads the same failure. A provider that blocks the account answers with the send route's `409 provider_account_blocked`, which `firstDayAccountBlocked` reads with the same wire parser, so one reading covers both routes; the person fixes it at the provider or connects another AI.

## Board writes that must not be lost

`activities/busy-retry.ts` re-issues a board-card write refused with "not now, ask again", so a card is never dropped to a busy or waking agent.

- `503 agent busy` with `Retry-After` comes only from the gateway that applies board writes itself on the per-turn pool path. It is honored within `WRITE_RETRY_BUDGET_MS` (20 s) of pauses, with `MIN_PAUSE_MS` (500 ms) so `Retry-After: 0` cannot spin.
- A waking answer (`isWakingAnswer`) is retried only for an id-bearing create marked `retryWhileWaking` (the optimistic mission row, whose turn is already on screen) and for the first-day start, along `WAKING_CREATE_RETRY_MS` (5, 15, 30 s). Every other write surfaces a waking refusal at once. Only an id-bearing create is safe to re-issue, because the host answers the stored row for a repeated create with the same id.
- Pauses count against the budget, not wall time, because each attempt already rides the gateway's own wake hold. A `compute_busy` or `pod_wake_refused` refusal has already been retried by `httpRequest` and surfaces here spent; no second ladder runs. An exhausted ladder rethrows the last refusal so the caller owns the one report.

## Session keys and status writes

`sessionKeyOf` and `matchesActivitySessionKey` (`activities/view-model.ts`) are the one rule for which chat a card opens: the explicit `session_key`, or the `activity-<id>` convention. Matching accepts either form, identical to the web adapter's resolver, so a turn's status write lands on the same card on every surface.

`setStatusBySessionKey` is the turn machinery's board write. `pendingInteraction` rides the same PATCH (`null` clears it at turn start and on any settle without one), so a `needs_you` card survives reload. A session key with no card (a transient chat with no mission) is logged and skipped, because a live turn must never fail on a missing card. Its refetch is silent.

`ACTIVITY_STATUSES` (`types.ts`) is the known vocabulary for mapping statuses to columns, not a validation gate. `status` stays a `string` because the domain preserves unknown statuses for forward compatibility, and a surface renders an unknown one neutrally.

## Narrow writes for the assistant

The assistant catalog reads an operation's route off the annotated function's own body (`scripts/assistant-catalog/assistant-route.ts`), so each catalog operation issues its request itself.

- `renameMission` (`mission-rename.ts`) and the mode write (`mission-mode.ts`) issue the same `PATCH /agents/:id/activities/:id` as `updateActivity`, but with a body that can express only a title or only a mode. The AI Manager gets the edits a person makes without the lineage the runtime owns (session keys, routine run ids, the pending interaction behind an approval card) and without a second, unguarded path to a status move. Status moves belong to the coordinator's `update_mission_status` tool, which refuses a running mission. `updateActivity` stays wide, hidden and the app's.
- `stampActivityMessage` (`http.ts`) is the turn's private writer. Generic catalog edits cannot stamp message time.

## Mission titles

`planMissionTitle` (`mission-title.ts`) asks the deployment: with `Capabilities.missionTitleOnSend` the server titles the card from the first send's `missionTitle` after that turn's reply. Otherwise, including a capability snapshot not loaded yet, the client asks `POST /agents/:id/title` once the card's row lands and PATCHes the card if the answer differs. The title is cosmetic and never throws or blocks the mission. `cleanGeneratedTitle` caps it at 6 words and 64 characters; with no answer the fallback is a whitespace-collapsed 60-character truncation or "New chat".

## Who started a mission

`missionStartedBy` (`started-by.ts`, published as `@houston/sdk/mission-started-by` and node-safe because `node --test` loads app modules that import it) is the one label for a card, the phone's rows and the archive. First match wins: routine run, setup task, Houston, API, AI Employee, then the person. A row with no `started_by` but an `origin_session_key` predates the field and was started by an agent, so older missions are never relabeled.

## Conversation list

`conversations` holds the list only. History and the feed belong to the turns module; keep it that way. The engine adapter also has a method named `listConversations` (`packages/engine-adapter/src/client/activities-mixin.ts`) that builds the board from missions. Neither calls the other. The module reaches agents through `ModuleContext.clientFor`, the memoized per-agent client it shares with turns. Rename and delete are pool ops on an asleep cloud agent, so a typed nothing-ran refusal is sent again rather than shown as a failed rename. The list view model maps `ConversationSummary` field by field rather than spreading it, so a new wire field never changes the snapshot shape.

## Mission search

`missions-search` matches the desktop board's search exactly: title first, then description, then chat-history content, accent- and case-insensitive with a multi-word phrase matched contiguously over flexible whitespace (`search-text.ts`). History is fetched only for missions not already matched, with bounded concurrency and a plain `getHistory`, never a stream. A per-mission history failure is logged and drops only that mission. The port returns a snippet string and a boolean; highlighting is the surface's job.

## Migration

`migration` moves one agent's data as zip chunks: export from one agent, import into another, then a marker on the target that says the transfer finished, so a resumed run skips an agent whose data already landed. These are host routes (`packages/host/src/routes/migration.ts`) the gateway proxies per agent.

- Nothing degrades. A missing route, a refused agent and a corrupt archive are three different answers, and a copy that quietly wrote nothing would look like one that worked. Every failure throws `MigrationHttpError` with its status.
- `null` from the marker read is the server saying it holds no marker; a 404 has already thrown, because a deployment that cannot be asked is not the same as one that says the agent was never imported. `MigrationMarker.source` and `counts` are nullable because the route stores what the caller sent.
- The archive travels as raw bytes, so the module has no `dispatch` commands; everything goes through the typed facade.

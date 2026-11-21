# app/src/hooks: design decisions

Covers `app/src/hooks/`, including `hooks/queries/`: the React hooks that bind SDK reads and events to the app. File paths in this record are relative to `app/src/`.

## Retry ladders live in the hook, not in TanStack `retry`

`call()` in `app/src/lib/tauri.ts` logs, toasts and reports every rejection it sees, so a query-level `retry` turns one waking pod into several reports. Bounded, reason-aware retries therefore run inside the query function, where intermediate attempts stay silent. The client default is `retry: false`.

Lives in `hooks/use-assistant.ts` (`discoverAssistant`), `hooks/queries/all-conversations-sweep.ts` (sweep runner), `hooks/queries/use-conversations.ts`.

## The cross-agent sweep never refetches on focus or on a timer

In hosted mode the all-conversations query fans out one request to every agent's pod, and each request resets that pod's idle-sleep clock. A background sweep would keep the whole fleet awake. It refreshes only from events and explicit invalidation, stays authoritative for a long freshness window, and is gated on the roster having settled for the current space.

Lives in `hooks/queries/use-conversations.ts`.

## A partial or slow sweep never rolls the board back

Agents that did not answer keep their last-known missions, and a slow sweep's reads (taken at `startedAt`) never overwrite rows the push stream patched later. An incomplete sweep schedules its own bounded re-sweep, because nothing else revisits that hole inside the freshness window. Sweep bookkeeping is module scoped, not per component, because several surfaces mount the hook and any of their query functions may be the one TanStack runs.

Lives in `hooks/queries/use-conversations.ts`, `hooks/queries/all-conversations-sweep.ts`.

## A sweep where every agent answered "not found" or "not allowed" is silent

That shape means a stale roster, not a failure, and it heals by reloading the roster.

Lives in `hooks/queries/all-conversations-sweep.ts`, `hooks/use-stale-roster-heal.ts`.

## Provider status probes are pinned to the space they ran in

A probe that resolves after a space switch describes a space the user has left and is dropped whole. After a switch the hook swaps to the new space's cached snapshot at once and re-probes live only once the new space's agents have loaded, because the probe routes per agent. Confirmed scans are persisted under the space they were probed in.

Lives in `hooks/provider-connections/use-provider-statuses.ts`.

## An unreachable probe is an error, not "everything is unknown"

The adapter never rejects; an unreachable engine resolves every provider as `unknown`. The status query rejects on that shape so it has a real error state, and every consumer reads the full tri-state: `unknown` shows a neutral "checking" state and never counts as connected or disconnected. A pending connect is cleared only by a confirmed status. A probe against a booting host gets one immediate second chance.

Lives in `hooks/use-provider-statuses.ts`, `hooks/provider-connections/unreachable-scan.ts`, `hooks/use-provider-connections.ts`, `hooks/migration-reconnect-trigger.ts`.

## The pi-ai catalog hydrates `PROVIDERS` in place during render

Hydration runs synchronously in render, guarded once per fetched catalog object, so a consumer re-keyed on `updatedAt` reads the populated cache in the same pass. Memos that call `getVisibleProviders` must key on `catalogUpdatedAt`, since in-place mutation gives React no signal. A failed or empty catalog load is surfaced, because the seed (all providers, zero models) looks like a working but empty catalog. A healthy host never serves an empty catalog.

Lives in `hooks/use-provider-catalog.ts`, `hooks/use-picker-view-models.tsx`, `hooks/use-provider-statuses.ts`, `hooks/query-error-toast-state.ts`.

## Provider id dialects are translated at one seam

The engine and gateway name providers in pi's canonical dialect (`openai-codex`); the app UI speaks Houston's display id (`openai`). The model-choice hook is the single read and write seam for stored choices, and login events are mapped to the display id before any keyed surface sees them.

Lives in `hooks/queries/use-agent-model-choice.ts`, `hooks/provider-connections/use-provider-login-events.ts`.

## OAuth URL relay for remote engines

When the engine runs remotely, it relays the login URL through `ProviderLoginUrl`. A mounted surface owns that event and the shell's global fallback stands down, so the URL never opens twice. On a co-located desktop engine the loopback flow completes in the user's own browser, so the URL opens directly with no dialog. Codex's device flow can emit twice (URL only, then with a code), so a shown code is kept. Completion and failure only clear the dialog or spinner for the same provider.

Lives in `hooks/provider-connections/use-provider-login-events.ts`.

## Browser tabs are claimed inside the click's user activation

Browsers refuse `window.open` once the click's activation is spent, and checkout and OAuth URLs arrive only after a request. The tab is claimed synchronously and navigated later; a refused open is carried back so the surface never claims a tab the user did not see.

Lives in `hooks/queries/use-org-checkout.ts`, `hooks/queries/use-custom-integrations.ts`, `hooks/queries/use-channels.ts`.

## Kept-alive screens disable their observers while hidden

The AI hub and Admin stay mounted while hidden. Their reads gate on an active flag so they do not poll or refetch on window focus off screen, while still painting the last reading.

Lives in `hooks/use-admin-screen-active.ts`, `hooks/queries/use-provider-usage.ts`, `hooks/queries/use-compute-usage.ts`, `hooks/queries/use-org-usage.ts`.

## Activity queries have no `initialData: []`

With an empty initial value the query reads as success with no data the instant a consumer mounts, so empty states flash during the round trip.

Lives in `hooks/queries/use-activity.ts`.

## Optimistic writes to one document

Every sidebar layout change writes the whole document. Each op applies to the freshest cached value and writes the cache in the same tick so back-to-back ops compose; invalidations of a layout with a pending write wait for that write's own settle. Agent delegation and instructions use the same rule: each PUT carries the whole state, so writes queue per agent and only a refused latest write is undone and told.

Lives in `hooks/sidebar-layout-writes.ts`, `hooks/queries/use-agent-delegation.ts`, `hooks/queries/use-instructions.ts`.

## Completion notifications latch on status and fire on the settle echo

The notification body depends on the interaction the turn ended on, which `persistBoardStatus` folds into the conversation VM after `SessionStatus completed` and before the settle's `ActivityChanged` echo. Notifications latch on completion and fire on the echo, with a grace timer fallback. A non-forced fire waits until that session's own settle has folded. Timer functions are wrapped because WebKit's `window.setTimeout` throws when invoked with a non-window receiver.

Lives in `hooks/completion-latches.ts`, `hooks/use-session-events.ts`, `hooks/completion-notification.ts`.

## Team notifications are only for the user's own missions and mentions

In a team many agents run in parallel, so a ping for every finished mission trains users to dismiss them. Only missions that are the user's or mention them notify. There is no push channel for mentions; the app watches conversation caches with a watermark and bumps the watermark before notifying, so a re-entrant cache event is a no-op.

Lives in `hooks/completion-notification.ts`, `hooks/use-mention-notifications.ts`.

## Notification clicks differ per platform

macOS and web surface a click as window focus, so focus is the navigate signal there. Linux and Windows emit a real `notification-clicked` event and do not focus the window, so they arm even while focused. Mobile uses the plugin's Actions API. Permission is never requested on load; it is asked with context.

Lives in `hooks/notification-click-listeners.ts`, `hooks/session-notifications.ts`, `hooks/use-session-events.ts`.

## Setup chats route to their owning section, not the board

Skill, routine and custom integration setup chats have no board card. A notification click routes to the employee's Skills section, Routines section or the Integrations catalog. A user who cannot configure the employee lands on its board.

Lives in `hooks/session-notification-navigate.ts`.

## Passive cache observers log instead of toasting

A cache observer has no UI thread and throwing would break the notification loop, so it logs and reports.

Lives in `hooks/use-mention-notifications.ts`, `hooks/use-read-cursors.ts`.

## Read cursors are written only for a mission the caches can name

A chat's query key carries a session key; only the board lists know which mission it is. Until they do, no cursor is written, because it would be keyed by something no reader looks up. The tracker observes the `chat-history` query that every chat surface mounts, so no surface has to report reads.

Lives in `hooks/use-read-cursors.ts`.

## Update policy

The machine knows how to download and install; the checker decides when (launch check, short interval, focus re-check). A launch find installs and relaunches; a mid-session find downloads. A return after a long absence installs only what a poll already staged, behind the launch overlay, and is committed before the first await so a queued keystroke cannot start a draft the relaunch would lose. Dev builds skip the updater. Repeated check failures are counted so a client that can never reach the feed is not stranded silently.

Lives in `hooks/use-update-machine.ts`, `hooks/use-update-checker.ts`.

## First-run routing reads `loaded`, not `loading`

The boot splash covers only the initial load. On the v3 control plane the first-run signal is a zero agent count, which cannot tell a fresh install from an emptied workspace, so a durable onboarding-completed account preference (with a device mirror written first) decides. Existing users with agents are backfilled as completed. A durable pending stage resumes onboarding that was quit after the first hire. Plain org members cannot create agents and skip the funnel.

Lives in `hooks/use-first-run-routing.ts`, `hooks/use-onboarding-completed.ts`, `hooks/use-onboarding-pending.ts`, `hooks/use-onboarding-flags.ts`.

## Onboarding survey push claims before writing the cache

The cache write re-renders and wakes the catch-up, so a save claims the push first. The push sends the whole record, not a delta, so a save after a failed one carries the dropped answer. The catch-up runs once per account. Exactly one hook instance is live.

Lives in `hooks/use-onboarding-survey.ts`, `hooks/onboarding-survey-flush.ts`.

## Locale resolution

The workspace locale override wins over the global preference. Only the global preference holds the first paint; the workspace override applies on arrival. A language pick applies locally first, then persists best effort, because on the first-run gate the user may not be signed in yet.

Lives in `hooks/use-locale-preference.ts`.

## Session query on web waits for the first `onIdTokenChanged`

firebase-js-sdk restores a persisted session asynchronously, so the query waits for the first emission, with a bounded timeout and a direct SDK probe before falling to signed out. On desktop, only a transient secure-storage read fault retries; it surfaces as a storage-error screen, never as sign-in.

Lives in `hooks/use-session.ts`.

## Cloud migration gate

The wizard shows only on the Tauri desktop shell against a remote engine, and never again on a machine that finished or declined it, whichever account signs in. A completed migration counts as onboarding.

Lives in `hooks/cloud-migration-trigger.ts`, `hooks/use-cloud-migration.ts`.

## Post-migration reconnect gate stays closed while signals are unknown

It shows only for a co-located engine whose host reports a legacy migration and no confirmed connected provider; an `unknown` probe defers it.

Lives in `hooks/migration-reconnect-trigger.ts`, `hooks/use-migration-reconnect.ts`.

## Bare keys yield to typing; dialogs own their own arrows

Board and panel keys (arrows, Enter, Escape) are bare and yield to editables and open dialogs. Modified global bindings fire anywhere. Bindings read `getState()` so they never hold stale state.

Lives in `hooks/board-keys.ts`, `hooks/use-keyboard-shortcuts.ts`.

## Document-level link safety net

Anchors nobody handled open in the system browser instead of navigating the webview, skipping events whose default was already prevented. The native context menu is suppressed in production builds. `pagehide` is the session-end signal in WKWebView.

Lives in `hooks/use-app-document-listeners.ts`.

## Assistant address is cached for the session

The address is fixed for a person in a space, so a settled answer never goes stale. A spent ladder on a waking pod keeps asking on a slow beat.

Lives in `hooks/use-assistant.ts`.

## Mutation results holding a secret are dropped on close

The mutation cache keeps a settled result for `gcTime`, so the API key mint result is removed the moment its dialog closes.

Lives in `hooks/queries/use-api-keys.ts`.

## Custom integration calls ride the per-agent routes

The hosted gateway proxies only per-agent custom routes; agent-less surfaces use the first agent as transport.

Lives in `hooks/queries/use-custom-transport.ts`, `hooks/queries/use-custom-integrations.ts`, `hooks/use-screen-prefetch.ts`.

## Desktop integrations need a fresh ID token on the local host

In platform mode the desktop holds no Composio key; every integration call is forwarded with the user's Firebase ID token, which is re-supplied after a sidecar respawn.

Lives in `hooks/use-integration-session-sync.ts`.

## Perf spans re-queue until a session exists

The transport throws without a session so the batch is re-queued (bounded) instead of counted as delivered, and drains when the session arrives.

Lives in `hooks/use-perf-spans.ts`.

## Send pin is read at send time

Every send awaits `resolveSendPin()` so it carries the composer's settled provider, model and effort rather than a value captured at render.

Lives in `hooks/use-send-pin.ts`.

## Long timers re-read the clock

`setTimeout` caps at 2^31-1 ms and a sleeping laptop fires late, so deadline timers re-read the live clock and re-arm.

Lives in `hooks/use-choice-now.ts`, `hooks/use-reconnect-notice.ts`.

## Visual viewport inset

The layout viewport can resize after the visual one reports while the keyboard animates, so the last event to fire wins.

Lives in `hooks/use-visual-viewport-inset.ts`.

## Analytics identity

`install_id` stays PostHog's distinct id because the website UTM bridge and onboarding funnel depend on it; the Firebase uid is aliased onto it at sign-in.

Lives in `hooks/use-identity-tagging.ts`.

## Move resume

An abandoned agent move leaves the gateway's lock in place and a locked agent cannot wake, so a boot-time healer re-drives recorded moves unless a live driver owns them.

Lives in `hooks/use-move-resume.ts`.

## Routine runs and health use the creator's credential

A fired routine runs on its creator's credential, so the viewer's probe is evidence only when the viewer is the creator. A provider pin fires on that provider even with no model.

Lives in `hooks/use-routine-provider-health.ts`, `hooks/use-routine-model-resolution.ts`.

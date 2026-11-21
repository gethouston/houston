# app/src/lib: design decisions

Covers the files directly under `app/src/lib/` (its subfolders have their own records): the error-surfacing layer, sign-in and session glue, missions, files, navigation, analytics, query persistence and the many small app models. File paths in this record are relative to `app/src/`.

## Firebase shares one session across tabs

Another tab can sign this one out or in as someone else, so the app checks whether Firebase still holds the session before restoring it from cache.

Lives in `lib/account-link.ts`.

## Acting user stamped on optimistic bubbles

The gateway stamps every persisted message with its author from `x-houston-acting-as`, so the send path stamps the same identity on the optimistic bubble and a reload matches.

Lives in `lib/acting-user.ts`.

## Active interaction derivation is reference stable

Two sources in priority order: the live VM interaction, then the persisted one. Persisted data can predate steps, so rendering tolerates missing fields. Stripped results are memoized per source so callers relying on identity do not reset. The completion body follows the first unmet need: questions, sign-in, connections, hands-on errands.

Lives in `lib/active-interaction.ts`.

## Per-agent authority

The org role sets the ceiling and the caller's effective access on each agent decides manager rights. One gate covers rename, delete, share and configuration.

Lives in `lib/agent-access.ts`.

## Agent file paths arrive in three shapes

Absolute in the engine host's separator, workspace relative, and percent-encoded markdown link destinations (micromark normalizes them). Conversion strips the host-reported real directory, then `folderPath` as a prefix.

Lives in `lib/agent-file-paths.ts`.

## First day start

Only an explicit `"pending"` offers the start button. The task is named for the board before its panel opens, because the sweep has not returned the row yet. A host refusal after a scan said an AI was connected triggers a re-probe.

Lives in `lib/agent-first-day.ts`, `lib/agent-first-day-model.ts`.

## Agent gone and not assigned are roster staleness

Agent-scoped routes resolve the agent id first. A 404 "agent not found" or a 403 `not_assigned` on a passive read means the local roster is wrong; the read stays silent and a deduplicated roster reload heals it. Agent-scoped queries gate on the current space's roster having settled.

Lives in `lib/agent-gone.ts`.

## Cloud has no file watcher

A finished turn invalidates the keys an agent may have written mid-turn (instructions, skills, learnings, files), because cloud has no watcher and no post-turn diff.

Lives in `lib/agent-invalidation-keys.ts`.

## Event invalidation plan

Events speak the server's workspace id, not the client's synthetic one, so workspace-keyed families are invalidated wholesale. The hosted stream is org wide, so agent events patch the aggregate only for agents in the viewer's roster. A stream reconnect marks every query stale because the feed has no replay cursor. OAuth return markers are consumed only by the event type they gate.

Lives in `lib/agent-invalidation-plan.ts`, `lib/agent-invalidation-types.ts`.

## Stale loads still lower the loading flag

An invalidated load's result is dropped but its loading flag must still come down.

Lives in `lib/agent-load-order.ts`.

## Kickoff pins and dialects

Setup chat kickoffs are fresh turns and follow the composer's initial-selection rule: a stored provider counts only while it is offered and signed in. Comparisons happen in the display dialect, and activity rows are stamped in the canonical dialect. Empty pin values are dropped.

Lives in `lib/agent-model-overrides.ts`.

## Agent names

Names are validated before the host (shape, the AI Manager's reserved name, duplicates). Truncation counts UTF-16 units, as the host does, and never splits a surrogate pair.

Lives in `lib/agent-name.ts`.

## Agent settings have one door

Configuring an agent is a manager's job and its settings page has one entry.

Lives in `lib/agent-nav.ts`.

## Cross-agent read failures

A cross-agent list can look complete while missing agents, so failed reads are named. When every read failed, an empty list is not evidence of an empty team.

Lives in `lib/agent-read-failures.ts`.

## Role context grammar lives in the domain package

The host reads the role back from every job description, so the cap and normalization are defined once in `@houston/domain`.

Lives in `lib/agent-role-context.ts`.

## Warming refusal avoids an import cycle

The guard pulls the provisioning store, which pulls the reporting layer, so the refusal is recognized structurally rather than by import.

Lives in `lib/agent-warming-refusal.ts`.

## First-day start skips the warming guard

A new hire offers its first day while its engine warms, and the SDK start rides the gateway hold.

Lives in `lib/agents-facade.ts`.

## Cached aggregate fallback

The all-conversations key embeds every agent's folder path from the non-persisted roster, so the IndexedDB-restored entry only reattaches by searching variants. A per-agent board recovers rows from the freshest variant.

Lives in `lib/all-conversations-cache.ts`, `lib/all-conversations-coverage.ts`.

## The aggregate is written by two hands

The cross-agent sweep and push-event patches both write the all-conversations aggregate. Patches stamp the time of their read, and a settled sweep keeps fresh rows only for agents that answered and were not patched at or after the sweep started. A single agent's patch re-reads only its slice rather than invalidating the aggregate.

Lives in `lib/all-conversations-freshness.ts`, `lib/all-conversations-patch.ts`.

## Sweep recovery is bounded and roster keyed

Each re-sweep touches every agent's pod and resets their idle-sleep clocks, so partial-sweep re-sweeps back off and stop. The user is told once per run, classified by reason (a waking pod or offline drop gets its own quiet register). The run counter is keyed by the roster signature so a space switch starts fresh. Outright failures retry inside the query function, not through TanStack `retry`.

Lives in `lib/all-conversations-recovery.ts`.

## Analytics bootstrap

PostHog keys and the app version are baked at build time; an empty key is a silent no-op. Autocapture, recordings and heatmaps use the same masking so user content never leaves. The session id is regenerated every launch and shared with the first-party pipe. The automation goal is free text and is excluded from the event allow-list; only a capped person property carries it. `$ai_generation` sits outside the event-name union.

Lives in `lib/analytics-bootstrap.ts`, `lib/analytics.ts`, `lib/analytics-vocabulary.ts`.

## In-app analytics bus

App listeners hear every tracked event regardless of PostHog, and errors are contained per listener because analytics is a side channel.

Lives in `lib/analytics-bus.ts`.

## WebKit transport failure wording

WebKit's transport-failure message names neither "network" nor "fetch", so the error-kind classifier matches it explicitly.

Lives in `lib/analytics-error-kind.ts`.

## Install vintage and identity

The Identity Platform session carries no creation date, so the acquisition cohort is stamped from the first install. `install_id` is the PostHog distinct id and the Firebase uid is aliased onto it.

Lives in `lib/analytics-identity.ts`, `lib/analytics-install-vintage.ts`.

## API key connect verdicts

The runtime's live verification carries a typed reason; user-fixable verdicts render remedy copy, and providers with a known remedy get their own sentence.

Lives in `lib/api-key-connect-error.ts`, `lib/api-key-reason-copy.ts`.

## API keys

A revoke that answers 404 is success because the list is cached for 30 seconds. `key_limit` is an expected state.

Lives in `lib/api-keys-model.ts`.

## Window hidden notice

React runs no cleanup when a window closes, so durable work listens to both `pagehide` and `visibilitychange`.

Lives in `lib/app-hidden.ts`.

## App version header

Every gateway call carries `X-Houston-App-Version: <semver>+<channel>`. The channel derives from the same build flag that makes a cloud build (`VITE_HOSTED_ENGINE_URL` baked into the cloud release legs). The window global must be installed before any gateway request.

Lives in `lib/app-version.ts`.

## Assistant discovery classification

Keyed on status and body code, never on message. 501 means this engine does not implement discovery (the gateway serves it); 503 with the no-credential code means the deployment serves no assistant; other 503s and pod states are transient. Transient failures earn four retries over about 15 seconds; a real failure gets one blind retry; after the ladder is spent, a slow beat keeps asking. Loading means neither an address nor a failure, because TanStack pauses offline queries.

Lives in `lib/assistant-availability.ts`, `lib/assistant-retry-schedule.ts`, `lib/assistant-discovery-state.ts`, `lib/assistant-discovery-ladder.ts`, `lib/assistant-address-cache.ts`.

## Attachments

Flat uploads land under `uploads/`, so a deeper relative path is a folder upload. Only executables, installers and exotic archives are blocked; zip and tar are allowed because the agent expands them with stock tools. Raster images are blocked only for a no-vision model. Hidden model-facing context is prepended but never shown.

Lives in `lib/attachment-message.ts`, `lib/attachment-validation.ts`.

## Auth errors are held until a listener mounts

Desktop OAuth failures can arrive before the sign-in screen subscribes.

Lives in `lib/auth-error-bus.ts`.

## Desktop Apple sign-in is GCIP brokered

Apple rejects 127.0.0.1 redirects on direct OAuth, so GCIP's hosted handler brokers a loopback flow.

Lives in `lib/auth.ts`.

## Concrete identity imports

Some modules import from concrete files instead of the identity barrel because the barrel pulls in Apple authorization code that does not load in every context.

Lives in `lib/auth-gateway.ts`.

## Explicit `.ts` import extensions

`app/tests` runs under `node --experimental-strip-types`, which does not resolve extensionless imports, so modules covered by those tests import with explicit `.ts`.

Lives in `lib/avatar-image.ts`, `lib/child-missions.ts`, `lib/chat-conversation-id.ts` and others.

## Avatar encoding

The gateway accepts png, jpeg or webp data URIs under 150000 characters; the client caps lower and walks quality steps, WebP first, falling back to the browser's substituted PNG when it fits.

Lives in `lib/avatar-image.ts`.

## Baked URLs have no fallback host

GitHub Actions cannot omit a job-level env key, so flavor-split builds set it to an empty string; empty reads as absent.

Lives in `lib/baked-url.ts`.

## Benign rejections

Supabase auth-js Web Locks steal and acquire-timeout errors, and WKWebView's abort-time fetch teardown rejections, are filtered as noise.

Lives in `lib/benign-rejections.ts`.

## Board navigation mirrors the kanban sort

Arrow keys follow the same per-column grouping and `lastMessageAt` order the user sees.

Lives in `lib/board-navigate.ts`.

## A mission board is two surfaces

Active and archive swap; a target is classified against the raw sweep rows, and a kept-alive board reappears on active unless a published nav names the archive.

Lives in `lib/board-surface-nav.ts`.

## Browser tab claims

Safari, Firefox and strict Chrome honour `window.open` only inside the gesture, so the tab is claimed synchronously and pointed later, with the opener severed before load. Native `Browser.open` is allowed after the async hop, so no tab is reserved there.

Lives in `lib/browser-tab.ts`.

## Bug reports always reach someone

The primary intake first; on any refusal the report goes through the fallback. `intake_unavailable` (a plan cap on our side) is a quiet class.

Lives in `lib/bug-report.ts`, `lib/bug-report-delivery.ts`, `lib/bug-report-failure.ts`.

## Draft keys on delete

A delete seam reads every row the cache can still name, across aggregate variants, so drafts are cleared for every key.

Lives in `lib/cached-conversation-rows.ts`.

## Canonical JSON

Property order is an accident of construction, so identity comparisons sort keys at every depth.

Lives in `lib/canonical-json.ts`.

## Allowed-models ceiling mirrors cloud

The rule matches cloud's `internal/modelceiling` (gateway clamp, model-choice route, local model bridge). A ceiling entry may carry `runsAs`. The removed-count is display only; the gateway enforces.

Lives in `lib/ceiling-match.ts`, `lib/ceiling-pin.ts`.

## Chat model picker ids

Rows use `${provider}::${model}`; provider ids are slugs and no model id contains a double colon. Curated rows lead in curated order. The account label is appended after localization.

Lives in `lib/chat-model-picker-ids.ts`, `lib/chat-model-picker-map.ts`.

## Composer pin coherence

One source of truth for the displayed and forwarded pair. A model the settled provider cannot run falls back to that provider's default, never to another provider's model. Rows stored before pins carried a provider count only where the catalog places that model.

Lives in `lib/chat-model-pin.ts`.

## Group-chat presentation needs proof

Only a transcript showing another participant forces group-chat sender presentation.

Lives in `lib/chat-sender-mode.ts`.

## Checkout return

Stripe returns to the web app's shared page, which hands the person back once per load to the tab that opened checkout or to the desktop deep link.

Lives in `lib/checkout-return.ts`, `lib/checkout-return-handoff.ts`, `lib/checkout-return-links.ts`.

## Child missions

A child is stamped with its parent's conversation id. `needs_you` and `error` both park in Needs you. A board item's chat address falls back to `activity-<id>`.

Lives in `lib/child-missions.ts`.

## Desktop Claude sign-in

Claude's own `claude auth login` mints the credential. On a co-located engine that is the directory the runtime reads, so nothing more is needed. On a remote engine the credential is minted into a handoff directory, pushed to the cloud (target pod from the adapter's one space-validated accessor), and the local copy is destroyed after the push settles. A push transport failure where the engine still reads connected is a recovered success; a genuine handoff failure is an infrastructure error, never the user's. Only transient failures retry, about 17 seconds worst case, so the user stays inside the existing wait. The `done` listener is registered before invoking so a fast completion cannot race. Re-entry is ignored while a login is in flight. A helper that cannot run falls back to the token paste flow. Failure details go to the log and Sentry, never a token.

Lives in `lib/claude-login.ts`, `lib/claude-login-remote.ts`, `lib/claude-login-settle.ts`, `lib/claude-push-retry.ts`, `lib/claude-credential-push.ts`, `lib/claude-login-failure.ts`.

## Cloud egress refusal

The managed cloud host refuses an unreachable local-model address with a 400 naming the rule; it is an expected state, matched structurally.

Lives in `lib/cloud-egress-blocked-error.ts`.

## Cloud migration

The wizard row renders the thrown message verbatim, so errors are authored as `"<label>: <server reason>"`. A 404 on the import marker means nothing is there (pods predating the status route). Target names keep the desktop name; collisions get suffixes, and resume probes are bounded to plausible previous outputs. Spawning the source host can block for minutes while the old chat db converts. Agent colour is a client-only overlay read from the legacy webview's localStorage. Per-request upload budget is bounded by time, not the gateway's 64 MB import limit; core entries go first. Phase weights keep per-agent progress monotonic, and overall progress is byte weighted. A failure after "Migrate later" is the teardown's consequence, not a defect. The outcome is stored per machine because the migration reads this machine's tree once. Demo mode exists only in dev (`VITE_MIGRATION_DEMO`).

Lives in `lib/cloud-migration*.ts`.

## Codex desktop OAuth loopback

OpenAI's OAuth client has one registered redirect on fixed port 1455. On a remote engine the desktop binds its own 127.0.0.1:1455 listener and relays the code; when the port is taken, a device-code fallback runs and the port conflict is a counted warning, not a Houston failure. A cancelled attempt tears down its listener so a late approval cannot land. The engine can drop a login before the callback (pod recycled, timer, restart); within a cooldown the relay restarts the same sign-in automatically.

Lives in `lib/codex-loopback.ts`, `lib/codex-loopback-failures.ts`, `lib/codex-device-code-fallback.ts`, `lib/codex-relay-recovery.ts`.

## Compatibility gate tests run the shipped artifact

`public/compat-gate.js` is tested directly so the gate cannot drift, and it must run after `#root` exists.

Lives in `lib/compat-gate.test.mjs`.

## Connect-AI gate

With no provider connected, the composer is replaced by a connect state, decided by one pure rule shared with the first-day start button, reading counts through the one connection derivation.

Lives in `lib/composer-connect-ai.ts`, `lib/connect-ai-gate.ts`, `lib/connected-providers.ts`.

## Confetti origin

Mission ids come from the engine, so the card is found by attribute value rather than an interpolated selector. Bursts are clamped inside the viewport and skipped under reduced motion.

Lives in `lib/confetti.ts`.

## Context window inference

The session high-water mark of `context_tokens` is a lower bound on the real window; the divisor starts at the catalogued default and snaps up when the peak exceeds it, and resets per model.

Lives in `lib/context-usage.ts`.

## Drafts are keyed many ways

A mission's unsent work can be parked under several session keys. Deletes resolve keys against a roster snapshot captured before the delete, because afterwards they cannot be resolved.

Lives in `lib/conversation-drafts.ts`.

## Conversation imports stay owed until sent

A failed import is retried later from this device.

Lives in `lib/conversation-import-facade.ts`.

## Partial sweeps resolve

A sweep where some agents failed resolves so `call()` raises no toast; the query layer owns that surface. Just-created agents are skipped because their reads would hold the scan.

Lives in `lib/conversations-facade.ts`.

## Copilot domain

Personal and Business sign in at github.com; only Enterprise data residency uses another host, which is always dotted.

Lives in `lib/copilot-domain.ts`.

## Copying an agent with chats

Copies get new task and conversation ids because those are global in the app. Transcripts move in batches and the board file goes last, replacing only an empty board. No pi session is rebuilt: copied transcripts carry the runtime's one-shot replay marker. Legs are idempotent and retried while the copy's engine wakes.

Lives in `lib/copy-agent-chats.ts`, `lib/copy-chat-remap.ts`.

## Mission creation answers at once

A composer send resolves when the turn is on screen and the board row lands in the background, because a warming engine holds the row write for the whole cold start. While warming, the row rides the queued send. A failure before any stream existed removes the placeholder row. Rows are stamped in the canonical dialect.

Lives in `lib/create-mission.ts`, `lib/create-mission-now.ts`, `lib/create-mission-warming.ts`.

## Created-mission handoff

A mission created outside a board is offered to the next board that opens it, for a short window, and exactly one offer stands.

Lives in `lib/created-mission-handoff.ts`.

## Per-user AI accounts

In a team space every turn runs on the sender's own AI account; there is no shared team account. A `null` scope means the deployment did not say.

Lives in `lib/credential-scope.ts`.

## Custom integration OAuth return

There is no client-side poll; the outcome arrives as a host event, and a one-shot marker decides whether to pull the app forward.

Lives in `lib/custom-oauth-return.ts`, `lib/custom-oauth-start.ts`.

## Account deletion

Server purge first, then a deeper-than-sign-out local teardown; local storage failures are logged because the account is already gone.

Lives in `lib/delete-account-flow.ts`.

## Error descriptions

Only short scalar fields are named in report titles; arbitrary payloads are listed by key.

Lives in `lib/describe-error.ts`.

## Native command list

Desktop code goes around `@houston/sdk` only for a capability that is a property of the machine; each command carries its reason for reviewers.

Lives in `lib/desktop-native-commands.ts`.

## Form dialog stays open on rejection

The recipe closes on resolve and stays open on reject, so a handled failure rejects without reporting.

Lives in `lib/dialog-stay-open.ts`.

## `<html lang>` follows the active locale

`index.html` ships `lang="en"` for the pre-JS frame and the active locale is mirrored once i18n resolves.

Lives in `lib/document-language.ts`.

## Effort gauge uses the global order

The composer passes `EFFORT_ORDER` rather than the model's own levels so the gauge looks the same across models.

Lives in `lib/effort-bars.ts`, `lib/effort-cycle.ts`.

## Engine error code

The machine-readable refusal reason is read wherever the host put it; every expected-state surface uses this one reader.

Lives in `lib/engine-error-code.ts`, `lib/engine-call-policy.ts`.

## Engine mode and co-location

Provider OAuth loopback works only when browser and runtime share a machine, because pi binds the provider's fixed localhost callback port in process. The desktop Codex relay is on only for a truly remote engine. Hosted auth method defaults to OAuth; `VITE_HOSTED_ENGINE_AUTH` is the switch. URL flags are trimmed like the shell's read in `lib.rs`, so a blank but set URL behaves the same on both sides.

Lives in `lib/engine-mode.ts`.

## Engine bootstrap

The transport resolves synchronously at module load from build-time flags. The v3 host adapter is flipped into host mode at module load, before anything reads it. A sidecar restart on a new port repoints the existing client in place so in-flight requests survive, and the recorded active space is re-applied to any rebuilt client. Hosted session refresh pushes the new bearer synchronously so every later read sees it. The app-update floor bakes the build identity and the 426 forwarder onto window globals the adapter reads.

Lives in `lib/engine.ts`, `lib/engine-tauri-events.ts`.

## Waking classifier lives in the adapter

The engine-waking classifier is owned by the engine adapter; the app re-exports it.

Lives in `lib/engine-waking-error.ts`.

## Error surfacing

Unexpected errors show nothing and are reported (log, PostHog, Sentry). A burst of one root cause failing many concurrent callers counts once per window, keyed by the copy it would have shown, while Sentry keeps every occurrence. Expected states, connectivity drops and waking pods get their own informational toasts, and the latter two skip Sentry. The synthetic signed-out 401, the warming-guard refusal, plan-floor refusals, non-creator webhook mints and dialog stay-open rejections are quiet classes. Diagnostic context goes into Sentry `extra`, never tags.

Lives in `lib/error-toast.ts`, `lib/error-report.ts`, `lib/error-burst.ts`, `lib/global-error-handlers.ts`.

## Global handlers filter known noise

Supabase lock steals, WebKit's rejection when a locked fetch body is aborted, dialog stay-open rejections, warming refusals, and uncaught transport or waking rejections are routed to their quiet or connectivity class.

Lives in `lib/global-error-handlers.ts`.

## External links

The desktop webview opens no new windows, so external clicks go to the system browser.

Lives in `lib/external-link-click.ts`.

## File bytes cache

Thumbnails and the preview share one byte cache keyed by file and mtime; entries without an mtime are not cached.

Lives in `lib/file-bytes-cache.ts`.

## File conflicts and refusals

The listing holds the whole workspace, so collisions are detected client side, but the host still answers `name_taken` when another writer races in. EACCES, EPERM and EROFS mean the workspace refuses every write. "Keep both" picks the first `stem (n)` free in both folders. Each refused write earns exactly one surface, and the host's `read_only` 403 (raised when the workspace folder answers EACCES, EPERM or EROFS) has one toast.

Lives in `lib/file-conflicts.ts`, `lib/file-write-refusal.ts`, `lib/file-list-patches.ts`, `lib/read-only-toast.ts`.

## File gone

`files/download` and `files/read` have one 404 path of their own, which means the file is gone, an expected state.

Lives in `lib/file-gone.ts`.

## Shell file failures

The shell's file commands reject with a typed failure mirroring `app/src-tauri/src/commands/file_failure.rs`; older commands reject with a plain string.

Lives in `lib/file-op-failure.ts`.

## File write tools

Two tool naming dialects reach the transcript, and both count as writes.

Lives in `lib/file-write-tools.ts`.

## Upload size cap mirrors the host

`MAX_UPLOAD_BYTES` in `packages/host/src/turn/files-import.ts` is mirrored; the client check uses `>=` because the host measures the decoded payload. An oversized file never aborts the rest of the batch.

Lives in `lib/files-upload-limits.ts`.

## First message beat

`first_message_sent` is armed only for a fresh account starting onboarding and fires once from the analytics bus.

Lives in `lib/first-message-sent.ts`.

## Foreign DOM guard

Browser page translation wraps text nodes in `<font>`, which breaks React's `removeChild` and `insertBefore`. The guard patches `Node.prototype` to redirect those calls to the actual direct child, and reports each rescue because it is invisible to the user.

Lives in `lib/foreign-dom-guard.ts`, `lib/foreign-dom-report.ts`.

## Gateway fetch

One way for app code to reach the gateway. Requests carry the active space's `x-houston-org` pin by default, re-read per attempt so a mid-flight switch is honoured. No bearer during boot is not always signed out. A refresh that returns a bearer the gateway already rejected is not replayed; a refused fresh bearer gets one verification re-send after a wait, mirroring the canonical transport's `cp/rejected-mint.ts`. One in-flight refresh is shared so a 401 storm mints once. A refresher failure reaching no identity service rejects instead of reading as sign-out. The refresh wrapper is `async` so a synchronous throw becomes the same rejection.

Lives in `lib/gateway-fetch.ts`, `lib/gateway-refresh.ts`.

## Hands-on errands

The protocol's surface vocabulary is closed so the navigation map is total. A step names its employee with no fallback to the one on screen. Billing and Danger zone screens are only the AI Manager's to hand over. Unsettled gates read as reachable.

Lives in `lib/hands-on-gates.ts`, `lib/hands-on-navigation.ts`, `lib/hands-on-screens.ts`.

## Hidden prompt text

When the wire prompt is not what the user wrote, the bubble shows what they wrote.

Lives in `lib/hidden-prompt-display-text.ts`.

## Home

The desktop opens on the first employee in sidebar order; every fallback lands home.

Lives in `lib/home-destination.ts`, `lib/home-nav.ts`.

## Local state on sign-out

Device-scoped `houston.*` keys survive sign-out; account-scoped ones are removed.

Lives in `lib/houston-local-state.ts`.

## i18n boot cache

The engine `locale` preference is the source of truth. A localStorage cache only avoids a flash of the wrong language before the handshake.

Lives in `lib/i18n.ts`.

## Identity reset

An identity change drops the whole client world. The `session` query root outlives it because it is the only signal the auth gates observe, and destroying it left the next sign-in inert until relaunch. File comment crops live in the engine SDK and are cleared too.

Lives in `lib/identity-reset.ts`, `lib/identity-cache-reset.ts`, `lib/identity-change.ts`.

## Avatar upload crop

`POST /me/avatar` accepts a WebP up to 2 MiB; the image is center-square cropped, never upscaled, and falls back to PNG where WebP cannot be encoded.

Lives in `lib/image-crop.ts`.

## Installed strips

Searching or expanding reveals every row; the expander shows only when the preview hides rows.

Lives in `lib/installed-preview.ts`.

## Integration artifact URLs

Keys ending in url or link that point at brand art or signed downloads are skipped; well-known artifacts get canonical URLs from ids.

Lives in `lib/integration-artifact-url.ts`.

## Integration cache patches

Custom lists are `null` when the host does not serve custom integrations. A shared host keeps one definitions list, so a write paints every list that holds it.

Lives in `lib/integration-cache-patches.ts`.

## Guided setup sentinels

Setup chats are marked by a sentinel in the activity `agent` field; one predicate recognizes any setup sentinel. Kickoff prompts are English; the agent mirrors the user's language.

Lives in `lib/integration-chat-setup.ts`.

## Connection gone

A connect poll reading one connection by id gets a 404 when the user removed it; that is an expected state.

Lives in `lib/integration-connection-gone.ts`.

## `integration_execute`

The tool appears under its plain name or an MCP-prefixed name; only the app's own answer counts as a run.

Lives in `lib/integration-execute.ts`.

## Approval cards

The host decides what is approved and sends it structurally; the card renders it in the reader's language, trusted only beside a live `requestId`. Bookkeeping arguments are hidden, malformed values are never rendered, and only the approve and deny answers mint receipts.

Lives in `lib/interaction-approval-labels.ts`, `lib/interaction-approvals.ts`.

## Interaction keys and drafts

Conversation keys are only unique per agent, so completion keys include the agent. A parked card's clicked approval is uncommitted on restore and the stepper rewinds to it. A parked card is retired only on proof that a turn took the conversation: a live frame or a `completed` settle.

Lives in `lib/interaction-completion-key.ts`, `lib/interaction-draft-hydrate.ts`, `lib/interaction-draft-retire.ts`.

## Dismissal folds onto the rendered interaction

Clean-finish offers are independent and dismissed one at a time.

Lives in `lib/interaction-dismiss.ts`.

## Interaction reply

One message is sent when the last step completes. Skipped credential steps and declines with instructions must be heard by the agent. Sequences carrying user-typed text resume visibly; signin-only and credential-only completions resume with a hidden follow-up. The reply send never rejects.

Lives in `lib/interaction-reply.ts`, `lib/interaction-reply-send.ts`, `lib/interaction-outcomes.ts`, `lib/interaction-answers-marker.ts`.

## Invites

`invitedBy` is the inviter's user id on the shipped gateway. Accept and Decline are separate buttons with per-button rage guards, so a per-invite lock prevents both firing. Disabling a query does not clear cached data, so the render is gated on Spaces too. `loadWorkspaces` swallows its failure, so only the workspace list proves the joined team reached the switcher.

Lives in `lib/invite-model.ts`.

## Job description excerpts

An excerpt is capped upstream and can end inside the frontmatter.

Lives in `lib/job-description-excerpt.ts`.

## Kickoff pin has three answers

A confirmed pair, "nothing connected" (pin nothing) and "scan cannot answer" (ask again) are distinct.

Lives in `lib/kickoff-pin.ts`, `lib/default-provider-model.ts`.

## Last sign-in hint

Device-local, so the full address is shown on the user's own machine. A corrupt blob is no hint.

Lives in `lib/last-sign-in.ts`.

## Learning provenance

A face is drawn only for a named person and its tone is keyed by the stable id. Learning ids are minted client side so the painted row and the stored one match.

Lives in `lib/learning-provenance.ts`, `lib/learning-optimistic.ts`.

## Legacy agent colours

Colour never crossed the wire; migration resolves it by exact id then by normalized name from the legacy overlays.

Lives in `lib/legacy-agent-colors.ts`.

## One-shot redemptions

Slack and LinkedIn return tickets are redeemed once and wait for capabilities; a held return is reported once per ticket.

Lives in `lib/linkedin-completion.ts`, `lib/slack-completion.ts`.

## List patches return the same array when nothing matches

So a patch that changes nothing does not re-render.

Lives in `lib/list-patch.ts`.

## Local model bridge reports

A superseded operation (space or agent switch) is cancelled, not failed.

Lives in `lib/local-bridge-ports.ts`, `lib/local-bridge-report-plan.ts`.

## Local models

Only reachable servers with at least one model are offered. A server with no bridge gets its own copy. Reasoning models are detected by id substring.

Lives in `lib/local-model.ts`, `lib/local-model-connect-state.ts`, `lib/local-model-reasoning.ts`.

## Locale resolution

The workspace override wins over the global preference, and only the global preference gates the first paint.

Lives in `lib/locale.ts`.

## Manager reachability

The manager's view opens when discovery serves an assistant or onboarding is running.

Lives in `lib/manager-reachable.ts`.

## Missing skill

`GET /v1/skills/<slug>` answers 404 "skill not found" when the skill was renamed, deleted or never installed, an expected state.

Lives in `lib/missing-skill.ts`.

## Mission cache patches

The same card lives in the agent's activity list and every roster variant of the aggregate, so optimistic edits paint both. A refusal restores only the fields this edit wrote, so a teammate's change stays.

Lives in `lib/mission-cache-patches.ts`.

## Mission people

The face stack puts the creator first. A mission with no attribution counts as the viewer's own. A mention counts as a ping only when written by someone else. Unknown people show a short id slice, never the raw id.

Lives in `lib/mission-people.ts`, `lib/mission-relevance.ts`.

## Mission prompts

A hidden kickoff is pure and persistable so it can ride the warming queue; prompt shapes that need the created id run at send time.

Lives in `lib/mission-prompt.ts`.

## Mission row landing

The row lands through the host's single id-honoring POST, and the SDK owns busy and waking retries. An agent vanishing under the send is a roster-stale state.

Lives in `lib/mission-row-landing.ts`, `lib/mission-row.ts`.

## Mission statuses

Only the user moves a mission to Done; the engine never does. `error` shares the Needs you column. Bulk moves exclude `running`. Confetti fires only for a move onto Done from another status.

Lives in `lib/mission-selection.ts`, `lib/mission-done-celebration.ts`.

## Mission titles

The SDK's `planMissionTitle` decides once per mission whether the server or the client titles it.

Lives in `lib/mission-title.ts`.

## Phone chrome

Chat is a push, not a tab, so the bottom chrome hides on a pushed chat.

Lives in `lib/mobile-tabs.ts`.

## Model favorites

Mutations serialize and read each base from the live cache, because two toggles reading the same stale base lost one.

Lives in `lib/model-favorites.ts`, `lib/model-favorites-core.ts`.

## Model labels

One naming chain (catalog label, engine-reported configured model, raw selection) for every surface that names a pair. `active_model` is the only name for a catalog-less provider.

Lives in `lib/model-labels.ts`, `lib/model-picker.ts`.

## Personal model choice in teams

In multiplayer the picker reads and writes the acting user's per-agent choice, and its display priority mirrors the gateway's per-turn resolution. `model_not_allowed` from `PUT /v1/agents/:slug/model-choice` means outside the ceiling.

Lives in `lib/model-selector-lock.ts`, `lib/model-not-allowed.ts`.

## Move resume

Phase 1 reads the recorded ticket; `done` means the server finished after the client vanished. Phase 2 re-POSTs on terminal failure because the lock is still held. `name_taken` before start holds no lock, so the record is void.

Lives in `lib/move-resume.ts`, `lib/move-wire.ts`.

## Navigation stack and history

The nav stack is the only code touching `history`. A pop leaves the stack array's identity unchanged so the history layer can tell a pop from a push. Popstates for echoed `go` traversals are ignored. Panel and preview open state are owned by surface claims. Desktop replaces the boot Agents home entry with the first employee.

Lives in `lib/nav-stack.ts`, `lib/nav-history.ts`.

## New mission compose

The phone compose opens the agent picker; one agent skips the question. A seeded composer keeps its words until the lesson moves on.

Lives in `lib/new-mission.ts`, `lib/new-mission-scope.ts`, `lib/new-mission-ids.ts`.

## Classifiers live in the engine adapter

The adapter is bundled by the desktop app, which cannot resolve some app paths, so transport and write classifiers live there and are re-exported.

Lives in `lib/network-transport-error.ts`, `lib/no-agent-provider-write-error.ts`.

## New agent colour

The first palette colour no teammate wears yet.

Lives in `lib/next-agent-color.ts`.

## Notification navigation

Finished sessions match their agent by folder path, not by the open agent. Session keys are unique only within an agent. Only macOS consumes the pending nav on generic foregrounding.

Lives in `lib/notification-nav.ts`, `lib/notification-relevance.ts`.

## Notification nudges and settings

Absence of the preference means ON. The in-app toggle has a synchronous mirror so the send path gates without awaiting. A denied permission is never re-prompted; the user is pointed at the OS pane. Nudges are fire and forget and guarded because preference reads can reject.

Lives in `lib/notification-nudge.ts`, `lib/notification-permission.ts`, `lib/notification-settings.ts`.

## Onboarding completed policy

Upgrade only: either store saying completed wins. Heal the account preference only after a successful empty read.

Lives in `lib/onboarding-completed-policy.ts`.

## Onboarding gateway record

A 2xx alone does not prove a write; answers missing from the gateway's reply were not stored. Remote answers fill only questions this device has not answered. The latest local goal action wins. Invalid values are dropped before a PUT. "Something else" always carries its words.

Lives in `lib/onboarding-gateway-record.ts`, `lib/onboarding-gateway-stored.ts`, `lib/onboarding-gateway-catch-up.ts`.

## Onboarding vocabularies

Industry answers use the hire catalog's ids; legacy survey ids map to the nearest context. Unknown company-size buckets read as null. The legacy segment preference stays in place for rollback. Any `onboarding_pending` value other than a known stage, including the tutorial's `"1"`, reads as none.

Lives in `lib/onboarding-industry.ts`, `lib/onboarding-company-size.ts`, `lib/onboarding-role.ts`, `lib/onboarding-legacy-segment.ts`, `lib/onboarding-pending.ts`.

## First-run signal

The legacy Rust wire signalled first run by zero workspaces; the v3 control plane has no workspace CRUD and uses zero agents.

Lives in `lib/onboarding-route.ts`.

## Survey completion gate

The survey gates on the whole record, answered or explicitly skipped, and re-opens once for a question added after the person answered.

Lives in `lib/onboarding-route.ts`, `lib/onboarding-survey-answered.ts`.

## Survey push ordering

One module-level chain of pushes for the whole app, because two overlapping pushes held by a waking pod can land in the opposite order to the answers. Every push sends the whole record, so a superseded queued push is skipped. A push that lands after a newer answer does not stamp synced. Claims release on failure so the catch-up can retry. The chain never carries a rejection forward.

Lives in `lib/onboarding-survey-push.ts`.

## Survey reconcile

`updatedAt` moves only with answers. The newer set of answers wins; the dismissal is monotonic and folded in either way.

Lives in `lib/onboarding-survey-reconcile.ts`.

## Survey record parsing

The goal cap counts Unicode code points, the unit the gateway counts (Go runes), so emoji count once. Fields that always existed parse all or nothing; later fields parse leniently. The retired department answer counts as any non-empty string.

Lives in `lib/onboarding-survey-record.ts`.

## Survey store

The uid-keyed mirror is written first and the engine write may fail silently, because the engine preference lives on the user's pod. Reads fall back from engine, to mirror, to the lifted legacy segment.

Lives in `lib/onboarding-survey-store.ts`.

## Survey sync stamp

A new answer clears the sync stamp; local UI state never touches sync fields. A record is synced only when the gateway's answer holds every field sent. Desktop syncs only when its engine is the hosted gateway.

Lives in `lib/onboarding-survey.ts`, `lib/onboarding-sync.ts`.

## Open helpers pin before navigating

Admin is kept alive, so its section is pinned before navigation. One-shots that open nothing are cleared so they cannot drill a later screen. Decisions wait for the roster to settle.

Lives in `lib/open-admin.ts`, `lib/open-agent.ts`, `lib/open-mobile-tab.ts`.

## External URL opens never reject

The outcome is a boolean and a failure is surfaced once.

Lives in `lib/open-external-url.ts`.

## Link versus path

A leading scheme is a URL; `C:\` and `C:/` are Windows paths, and a single-letter scheme is treated as a path.

Lives in `lib/open-href.ts`.

## Optimistic write core

Patches match by key prefix. Undo reverts only what the paint wrote, comparing the entry now with paint time, so unrelated changes survive. In-flight refetches are cancelled so they cannot land the pre-write list over the paint. Holds re-apply pending patches to any data that lands on a matching key; a flag stops the re-application from looping because the cache notifies synchronously. A refusal is always surfaced because the user saw the change undone.

Lives in `lib/optimistic-core.ts`, `lib/optimistic-hold.ts`, `lib/optimistic-refusal.ts`, `lib/optimistic-write.ts`.

## Org checkout

Another outstanding checkout keeps its session; an idle tracker means the identity changed.

Lives in `lib/org-checkout-run.ts`.

## Org roles

Mirrors the Teams role matrix v2. The AI Models hub is visible to everyone, because every member connects their own AI account. Only owners mutate members and delete the workspace. Owner is a grantable role.

Lives in `lib/org-roles.ts`, `lib/billing-gates.ts`.

## Org skill sharing

A skill created in a create-with-AI chat is promoted to the workspace store and installed only to the agent that built it. A 409 or policy refusal is expected. A shadowing identical local copy is harmless.

Lives in `lib/org-skill-share.ts`.

## Partial sweep surface

A partial sweep is judged by its first real failure; one with only expected environment failures gets a quiet informational surface at notice and at escalation.

Lives in `lib/partial-sweep-surface.ts`.

## Pending moves are durable

The gateway keeps a move lock when the mover fails or crashes, and only a re-POST releases it, so the move is recorded. In-memory claims mark which surface is driving.

Lives in `lib/pending-move.ts`, `lib/pending-team-move.ts`.

## Perf spans

Timeouts are censored outcomes in the gateway histograms. Spans carry the org a turn was sent in, from org history, not the one active when the answer landed. A mirror-only build drops batches. Transient failures re-queue once.

Lives in `lib/perf-spans.ts`, `lib/perf-span-marks.ts`, `lib/perf-span-mirror.ts`, `lib/perf-span-org-history.ts`.

## Plan refusals are business states

`400 plan_min_interval` and the weekly message limit are expected states with plan copy.

Lives in `lib/plan-floor-toast.ts`, `lib/plan-message-limit.ts`, `lib/plan-min-interval.ts`.

## Plan ready

A lone undismissed `plan_ready` step resolves to the plan card instead of the stepper.

Lives in `lib/plan-ready.ts`.

## Platform detection

Houston does not bundle `@tauri-apps/plugin-os`, so the OS is read from `navigator`. The web app labels spans "web".

Lives in `lib/platform.ts`.

## Provider connect dialog close

A close caused by a dialog that finished its part is progress, not cancel, so the chat's connection observer stays armed.

Lives in `lib/provider-connect-dialog-close.ts`.

## Provider connect step memory

Cancelled steps and already-resumed steps outlive the card, bounded per set. The first card to claim a resume wins; a resume whose send never left is released.

Lives in `lib/provider-connect-step-memory.ts`.

## Provider connection derivation

One derivation of connected. Confirmed connected drives badges and sign-out; the permissive read is true for `unknown` and never drives a badge. The reconnect card clears only on a fresh confirming probe.

Lives in `lib/provider-connection.ts`, `lib/provider-connect-probe.ts`.

## Provider login errors

`ProviderLoginComplete` carries a plain error string, localized by value match; the adapter stays i18n agnostic.

Lives in `lib/provider-login-error.ts`.

## Provider status cache

Probes can take seconds per provider, so the last scan is cached per active space and used as a paint hint. A probe overtaken by a space switch is dropped. The orphaned unscoped snapshot is removed once.

Lives in `lib/provider-status-cache.ts`.

## Picker status query

The key includes the workspace because provider connections are tenant data while the space is only a header. A disabled query is not loading for TanStack, so checking is read explicitly. While the last probe failed, it re-probes on a short interval.

Lives in `lib/provider-statuses-query.ts`.

## Mid-session provider switch

A conversation that fits the target window with headroom replays verbatim; otherwise it is summarized.

Lives in `lib/provider-switch.ts`.

## Store apps never sell

Apple and Google forbid selling a digital subscription inside a store app outside their billing, so every checkout, portal and external payment link is blocked there and reported, and the manager's purchase approvals say where the plan is managed.

Lives in `lib/purchase-policy.ts`, `lib/purchase-approval.ts`.

## Query keys

Agent-scoped keys are `[resource, agentPath, ...]`. Integrations are user level. The assistant address key includes the space. Onboarding flags are user scoped and space invariant. Billing and moves are keyed so no org or retry shares an entry.

Lives in `lib/query-keys.ts`, `lib/query-keys-org.ts`.

## Query persistence

Pod-held list queries are persisted to disk, scoped to the gateway and user identity. Every restored list is marked stale because the event stream has no replay. Restored queries outlive the in-memory GC while restorable. Sign-out wipes every persisted copy.

Lives in `lib/query-persist.ts`, `lib/query-persist-policy.ts`.

## Quiet classes

The vocabulary and burst rule are the SDK's; the app classifies gateway error shapes and stamps the agent a call was scoped to. A quiet failure sends one warning-level Sentry event with a fixed fingerprint. The user's own upload cut gets copy naming it and its own fingerprint.

Lives in `lib/quiet-error-class.ts`, `lib/quiet-error-report.ts`, `lib/quiet-state-surface.ts`.

## Read cursors

One live store per process, re-pointed on uid change. Cursors persist as one blob per user, and several tabs share the origin, so every save merges before writing and other tabs' writes fold in without write-back. Merge takes the later watermark and the earlier `since`. The schema version is not a gate; fields are validated individually. A null storage key is a whole-origin clear from a sign-out elsewhere.

Lives in `lib/read-cursor-live-store.ts`, `lib/read-cursors-merge.ts`, `lib/read-cursors-parse.ts`, `lib/read-cursors-storage.ts`.

## Read cursor storage limits

localStorage is a hard limit of about 5 MB per origin, shared with the query persister, so cursors are capped per user, keeping the most recently touched keys with ties broken by key so the set is deterministic. Only a few other accounts' blobs are kept per device. Writes merge over what is on disk. A mention read floor deliberately does not fall back to `since`, because a mention names the user personally.

Lives in `lib/read-cursors.ts`, `lib/read-cursors-storage.ts`.

## Refetch after write

A plain invalidation is not enough while a refetch from before the write is in flight, so the stale fetch is cancelled first.

Lives in `lib/refetch-after-write.ts`.

## Fire-and-forget promises carry a reporter

Handlers attach the reporting path to background promises instead of leaving them unobserved.

Lives in `lib/report-rejection.ts`.

## Roster heal and settle

A failed read saying the agent is gone triggers a silent roster reload for the current workspace. Work waiting on a settled roster runs on the first write that settles it.

Lives in `lib/roster-heal.ts`, `lib/roster-settled.ts`.

## Routine setup chat

Kickoffs are English; the agent mirrors the user's language. The event catalog is embedded in the prompt within a character budget. The wake interview runs only when the wake is fully undecided, and saving enforces exactly one wake mechanism. The chat and routine link is stored in both directions and repaired one fix at a time until consistent. A legacy sentinel from the pre-merge Reactions tab is still recognized because user data carries it. The prompt names the providers the user actually has connected.

Lives in `lib/routine-chat-handoff*.ts`, `lib/routine-chat-prompts.ts`, `lib/routine-chat-setup.ts`, `lib/setup-chat-prompt-shared.ts`.

## Routine writes

A routine write on the hosted profile can take seconds, so edits paint optimistically; untouched rows keep their identity. A real schedule clears the trigger and vice versa. "Run now" answers with no run id, so a placeholder run is painted and a stop on it waits for the real run. `404 routine_not_found` refreshes the list. A plan-floor refusal is not a failure.

Lives in `lib/routine-optimistic.ts`, `lib/routine-run-optimistic.ts`, `lib/routine-gone-surface.ts`, `lib/routine-write-failure.ts`.

## Routine provider health

A routine has no composer to fail in front of, so its account's health is shown before any run. `unreachable` collapses to unknown. Connecting is the remedy except for `out_of_credits`.

Lives in `lib/routine-provider-health.ts`, `lib/routine-pinned-pair.ts`.

## Row revert

Undo restores only rows the write painted; a removed row goes back after its nearest listed predecessor. A touched row missing from the current list was removed by someone else.

Lives in `lib/row-revert.ts`.

## Save blob

Browser builds use anchor downloads; the desktop writes natively and may fall back to a free sibling name.

Lives in `lib/save-blob.ts`, `hooks/use-save-download.ts`.

## Send failures

A send that failed before any turn stream existed gets one toast, because nothing wrote to the VM. The generic toast is skipped when `call()` already explained the failure.

Lives in `lib/send-error-toast.ts`, `lib/send-failure-explained.ts`.

## Send pin gate

The pin is assembled from several async reads; a send waits for them to settle, and the open conversation's real row supersedes the pin-less placeholder from the aggregate.

Lives in `lib/send-pin-gate.ts`.

## Sentry

Renderer events go straight to Sentry over HTTP, not through the tauri-plugin-sentry IPC bridge. The release must match what the Rust SDK reports. User content is scrubbed because messages, prompts, names and paths are personal. Release-health sessions are tracked in Rust. Session Replay is off with explicit zero rates. An event id is surfaced only when the transport flushed and Sentry answered 2xx; an absent status is not acceptance. Dev builds suppress Sentry unless `SENTRY_SEND_IN_DEV` is set, because official builds bake the production DSN. An error already captured is marked so later layers do not capture it again. The deployment vocabulary matches the engine's.

Lives in `lib/sentry.ts`, `lib/sentry-transport.ts`, `lib/sentry-delivery.ts`, `lib/sentry-dev.ts`, `lib/sentry-deployment.ts`, `lib/sentry-reported-mark.ts`, `lib/sentry-quiet.ts`, `lib/sentry-feedback.ts`.

## Session cache identity guard

An account switch without sign-out drops the outgoing identity's world before the session cache is written.

Lives in `lib/session-cache.ts`.

## Session failure analytics

One `app_error_shown` per distinct problem per conversation per hour, classified by the SDK's typed class rather than copy.

Lives in `lib/session-failure-analytics.ts`.

## Settings landings

The Slack callback carries navigation and a one-time ticket, never credentials. Reading and stripping the ticket from the address bar happen in one step at boot, before analytics and Sentry start, so the first event never carries it. The OS keeps answering the cold-start read with the launching link until the process exits, so only links carrying a completion are spent by applying them, and each is applied once after sign-in, space and capabilities settle. Deep links may open only a small set of sections.

Lives in `lib/settings-landing.ts`, `lib/settings-link-gate.ts`, `lib/settings-sections.ts`.

## Fan-out refusals

A write sent to many agents through `Promise.allSettled` rethrows one failure so its rollback reads like a single write.

Lives in `lib/settled-refusal.ts`.

## Setup mission hello

The hello waits for the job description so it is never shown without the role and rewritten. Creation records expire after a TTL.

Lives in `lib/setup-hello.ts`, `lib/setup-mission-greeting.ts`.

## Share errors

The C8 gateway predates the `{error, code}` shape, so the share flow alone falls back to matching the English sentence.

Lives in `lib/share-error.ts`.

## Share via team

The moving step is non-dismissable because a half-completed move must not be abandoned, and has a wall-clock ceiling. Org create is not idempotent, so a lost response is reconciled before retry. Invites are sent only after the move completed and the space switched.

Lives in `lib/share-via-team.ts`.

## Shared skills availability

A 503 naming no bound blob store means the deployment does not run shared skills; that is feature absence, not failure. The store's own answer outranks the capability flag.

Lives in `lib/shared-skills-availability.ts`, `lib/workspace-shared-skills.ts`.

## Shortcuts

Keystrokes from typing targets, dialogs and popovers are left to them; an empty auto-focused input still lets arrows through.

Lives in `lib/shortcuts.ts`.

## Sign-in establish

A sign-in that created the account emits `user_signed_up`, identified first so the Slack destination renders the person's name.

Lives in `lib/sign-in-establish.ts`.

## Sign-out

Two independent cleanups (session and local data) are classified separately. Connect polls and pending loopback authorizes are cancelled before the session goes, so they cannot carry into the next account or hold the port. Local cleanup always runs.

Lives in `lib/sign-out.ts`, `lib/sign-out-failure.ts`.

## Skill setup chat

Each custom skill has one setup chat, linked through the skill's `setup_activity_id` frontmatter and the forward link, repaired one fix at a time. Existing skills get a per-turn context prefix naming the bound skill.

Lives in `lib/skill-chat-*.ts`.

## Skill paths and frontmatter

A skill is a folder under `.agents/skills/<slug>/` or `.claude/skills/<slug>/`. Title rewrites collapse block-scalar continuation lines.

Lives in `lib/skill-folder-path.ts`, `lib/skill-title.ts`.

## Skill optimistic writes

The store list key is a prefix of every store skill's detail key, so patches target the list exactly.

Lives in `lib/skill-optimistic.ts`.

## Space cache

Session, user-scoped preferences and each space's settled assistant address survive a space switch; everything else is purged. The personal workspace id is synthetic, and events speak the server's vocabulary, so workspace-scoped invalidation is gated by a translation.

Lives in `lib/space-cache.ts`, `lib/space-id.ts`.

## Stale attachments

The browser re-validates a lazy `File` handle at upload and throws when the file changed on disk; that is the user's environment.

Lives in `lib/stale-attachment.ts`.

## Startup analytics order

`install_created` must precede the onboarding funnel. The attribution bridge opens the website's `/welcome` page and is silent on failure.

Lives in `lib/startup-analytics.ts`, `lib/web-session-start.ts`.

## Stop errors

Every stop catch shares one toast so quiet states branch in one place.

Lives in `lib/stop-error-toast.ts`.

## Store skill locale migration

Unedited English store skills swap for translated versions when the workspace language is es or pt. Slugs can be ambiguous across store agents, so content is compared too. Slug tokens are rewritten longest first on kebab boundaries.

Lives in `lib/store-skill-locale-migration.ts`.

## Surface gates

Every flag is read off capabilities; unanswered capabilities read as single player, so callers must wait for `ready`. The assistant gate asks whether the deployment holds an assistant, and discovery stays out of `ready`.

Lives in `lib/surface-gates-model.ts`.

## Sweep settledness

An in-flight sweep reads as zero missions, so watchers wait for a settled answer. An empty roster settles at once.

Lives in `lib/sweep-settled.ts`, `lib/sweep-authoritative.ts`.

## `tauri.ts` is the error-surfacing layer

Every domain call flows through `call()`, which logs, classifies and surfaces. Expected business states (`needs_upgrade`, `personal_space`, `last_owner`, runtime-only provider writes, owner-only provider connect, cloud egress refusal) get informational toasts; connectivity and waking states get their own and skip Sentry; aborts are expected. Passive agent-scoped reads silence agent-gone errors and heal the roster. Just-created agents answer reads with "nothing yet". User-initiated failures always capture to Sentry. The real error is passed so Sentry records the adapter frame. The expected team states (`needs_upgrade`, `personal_space`, `last_owner`) are named once in `lib/team-status-model.ts`.

Lives in `lib/tauri.ts`, `lib/team-status-model.ts`.

## Provider login topology

`deviceAuth` defaults from topology: a co-located desktop can catch the runtime's loopback. Anthropic on a co-located desktop uses the native browser login, never the setup-token paste flow. Codex against a remote engine uses the loopback relay. Cancel tears down whichever flow ran.

Lives in `lib/tauri.ts`.

## Provider status mapping copies fields explicitly

The status mapping keeps only named fields, so credential attribution is copied through explicitly on both single and batched paths. The stored `default_provider` can hold either dialect and is normalized on read. A hosted Claude subscription login ends about 28 days after sign-in.

Lives in `lib/tauri.ts`.

## Team moves

The pending record is written before the POST so a quit mid-request can resume.

Lives in `lib/team-agent-move.ts`, `lib/team-move-retry.ts`.

## Theme

The native window is one resource and `setTheme` calls can land in either order across IPC, so they are serialized and the queue keeps flowing past a failure. An explicit mode pins the macOS title bar; following the system hands the window back to the OS before reading `prefers-color-scheme`, because WKWebView derives it from the window. A boot mirror carries the resolved theme and two hexes for the first frame before token CSS exists. A failed preference read is distinct from no preference.

Lives in `lib/theme.ts`, `lib/theme-apply.ts`, `lib/theme-boot.ts`, `lib/theme-native.ts`, `lib/theme-model.ts`.

## Timezone seed scope

One person in one space, because the gateway keys preferences by org and user.

Lives in `lib/timezone-seed.ts`.

## Top-level views

Board shortcuts belong only to the open Tasks section. A pinned view whose gate is off falls back.

Lives in `lib/top-level-views.ts`.

## Transient errors

A 5xx or network drop is worth a bounded retry.

Lives in `lib/transient-error.ts`.

## Turn summary

External write actions lead. A write action is detected by mutation verbs in either a Composio slug or a custom executor address, and only successful ones count. Paths are deduped workspace relative, with host-native separators handled. Writing `<slug>/SKILL.md` names the skill.

Lives in `lib/turn-summary-items.ts`, `lib/turn-integration-updates.ts`.

## Turn mode

`plan` pins a read-only planning turn. Unknown values read as the default. The mode is kept on the card so it survives leaving.

Lives in `lib/turn-mode.ts`.

## Unread

Unread is defined against the user's own read floor and only for relevant missions; setup chats are never unread.

Lives in `lib/unread-model.ts`.

## Updates

A release is never installed out from under a working user. Checks are fail open; three consecutive failures (about ten minutes) count as stuck, reported once per streak. Focus re-checks are throttled. A disk-refused download is not retried automatically that session. The shell's resumable download classifies `network` and `upstream` as expected. Download and install are separate steps; the bundle path is captured before install because macOS moves the bundle. The launch check is the first check of the process, because `<App/>` remounts. A return is an absence longer than a meeting, detected by focus or by a late interval tick proving timers did not run; a remote engine relaunch kills no sidecar but still drops unsent work, so loss gates are read twice.

Lives in `lib/update-*.ts`.

## Upload progress

A finished file keeps its done entry until the batch settles.

Lives in `lib/upload-progress.ts`.

## URL open failures

The shell rejects typed (`url_open_failure.rs`); a machine with no default browser gets an informational toast.

Lives in `lib/url-open-failure.ts`.

## User-told marker

`call()` stamps an error when it already showed authored copy, so later layers do not repeat it.

Lives in `lib/user-told-mark.ts`.

## User-visible files

Plain-text formats agents write as output (including `md`) get file cards; shell commands report no structured list, so produced paths are read from the command.

Lives in `lib/user-visible-files.ts`.

## Waking retry

A write against a pod mid-wake can return the waking 503 even after the gateway's hold, so it is re-run.

Lives in `lib/waking-retry.ts`.

## Warming sends

A send during warm-up never goes out as a held request. The wire prompt is built at flush time because building it writes attachments through the engine. Fetched rows win by id over optimistic rows. Rows store pi's canonical id and pins are re-canonicalized. The bubble is never doubled. A row whose turn never went out is settled. An agent vanishing between probe and write is roster staleness.

Lives in `lib/warming-sends.ts`, `lib/warming-send-*.ts`, `lib/warming-board-rows.ts`.

## Web identity loads lazily

firebase-js-sdk stays out of the boot chunk.

Lives in `lib/web-identity.ts`.

## Web visitor id

The marketing site's `?hv=` id is read and stripped from the address bar in one pass, before the first event. Storage is best effort.

Lives in `lib/web-visitor-landing.ts`.

## Workspace delete

`has_members` (409) is explained by the Danger Zone. An optimistic delete is used only when the pre-check proves the gateway will accept it; a rejected delete puts the row back.

Lives in `lib/workspace-delete-model.ts`, `lib/workspace-refresh.ts`.

## Workspace skills

Copy-based: skills live on each agent and copies of a slug collapse to one row. Assignment edits diff into minimal writes.

Lives in `lib/workspace-skills.ts`.

## Workspace switch

"No current workspace" hides three different situations (loading, failed, none), and each renders differently.

Lives in `lib/workspace-switch.ts`.

## Fullscreen read

A superseded read's failure is not the window's state.

Lives in `lib/window-fullscreen.ts`.

## Viewport

`viewport.ts` is the imperative twin of `useIsMobile()` for store-free code.

Lives in `lib/viewport.ts`.

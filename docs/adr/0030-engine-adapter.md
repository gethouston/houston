# The engine adapter binds the SDK to a real transport

`@houston/engine-adapter` (`packages/engine-adapter/src`) is the client every frontend talks to. Desktop and web run the same code. It binds `@houston/sdk` to the gateway or host, owns every fetch, SSE stream and socket the frontends make, and translates transport; it does not decide domain behaviour. `app` and `packages/web` both depend on it as a workspace package resolved by pnpm, with no alias (`index.ts`), and it re-exports `@houston/wire-types` so `app/src` sees one surface.

## Shape of the client

- `HoustonClient` (`client.ts`) is composed from cluster mixins under `client/`, all reading one shared `AdapterContext` (`client/context.ts`) for `cp`, `engine` and `sdk`. `MIXINS` is effectively an unordered set: the clusters are method-disjoint and hold no state of their own. `client-mixin-composition.test.ts` pins that no two mixins declare the same method and every mixin module is listed, which is also what makes the `ComposedClient` intersection type exact.
- There is no catch-all Proxy. The old adapter answered unknown methods with `async () => []`, which hid failures. An undefined method is now a real `TypeError`.
- `AdapterContext` is assembled from `EngineEndpoint` (`client/endpoint.ts`: base URL, bearer, the one `authFetch`, the live `ControlPlaneConfig`, and the two in-place repoints `setEndpoint` and `setActiveOrg`) and `agent-selection.ts` (which agent the client acts on). Every consequence of "we now talk to something else" is decided in `endpoint.ts`.
- Control-plane code is imported through the barrel `control-plane.ts`, never `cp/*` directly, because the web suite mocks the barrel wholesale and a submodule import slips past the mock (`endpoint.ts`, `sdk-client.ts`, `client/base.ts`, `client/context.ts`, `client/sdk-error.ts`).
- Classifiers the app's error layer needs (`engine-waking-error.ts`, `network-transport-error.ts`, `org-admin-required-error.ts`, `provider-login-session-lost.ts`, `waking-stuck-tracker.ts`) live here and are re-exported from `app/src/lib/*`. The desktop bundle cannot resolve `@houston/app/*`; an adapter import of app code once broke every desktop release build while the web build passed. They stay dependency-free so `node:test` loads them directly.

## The SDK instance

`createEngineSdk` (`sdk-client.ts`) is the one place the adapter builds a `HoustonSdk`.

- Reactivity is off. Web owns its read model (TanStack Query) and its own `/v1/events` bus, so a second stream would duplicate both. Constructing the SDK sends no request.
- It runs on the same `gatewayAuthFetch` the adapter's own client uses, so bearer, 401 recovery and `x-houston-org` have one live source, and `setActiveOrg` reroutes SDK calls too. The read retry (`cp/transient-retry.ts`) is composed here, once, so a delegated GET rides out a rolling deploy or a cold pod. Other delegated writes remain exactly one request.
- `SDK_STORAGE_PREFIX` (`houston.sdk.`) namespaces SDK storage; `createWebStorage` falls back to memory where `localStorage` is unavailable so construction never throws.
- `devicePreferences` is the adapter's own `houston.pref.*` layout (`client/device-prefs.ts`), so a capability moved into the SDK reads back what the person picked before. The prefix and key names are a contract. Nothing there catches: a blocked or full store throws, because suppressing it let a write resolve having stored nothing and a palette pick vanished on next boot (`packages/web/tests/device-prefs-storage.test.ts`).
- The SDK is rebuilt on every bearer rotation and per space, so `sharedFanOutGate` and `sharedPageLifecycle` (`page-lifecycle.ts`) are page-wide singletons. A fresh gate per SDK would break the roster bound mid-sweep, and fresh window listeners would never be removed. `setEndpoint` hands the typing state to the new SDK so a new chat keeps its prewarmed id.
- `sdkForSpace` pins an SDK to one space, so every request it makes, a 401 replay included, carries that space's header even if the person switches mid-flight. The timezone seed uses it.

### viaSdk

`viaSdk` (`client/sdk-error.ts`) runs a delegated call with `cpFetch`'s observable behaviour: a per-agent success ends that agent's stuck-wake episode, and a failure becomes the `HoustonEngineError` the app expects. It needs the request path as the SDK builds it, because the error does not carry it and it is the only source of the agent id. Each mixin therefore spells its path (`agentFilePath`, `integrationPath`, `custom-routes.ts`). Non-HTTP failures (a programming error, an abort) pass through untouched so no status is invented.

Two bindings skip it on purpose. `identity.ts` runs before sign-in with a fetch that carries no bearer and no space, and translating would erase the SDK's typed email-code refusal. `client/appearance-mixin.ts` touches only device storage, so there is no response to translate and a made-up path would be published by the catalog generator.

## Gateway auth transport

`gatewayAuthFetch` (`cp/fetch.ts`) keeps auth invisible across cloud restarts.

- The bearer is read live per attempt (`liveToken`), never pinned, so a silent refresh applies without rebuilding. A caller-supplied bearer source outranks the engine global.
- `x-houston-org` is re-read per attempt from `ControlPlaneConfig.activeOrgSlug`, which `setActiveOrg` mutates in place; absent means the personal org. Account-wide routes never carry it (`plan-mixin.ts`, the billing choice).
- `X-Houston-App-Version` (`app-version.ts`) is attribution only; the server-side version gate was retired. It rides a window global set only when running in Tauri, because the custom header makes every request CORS-preflighted and a host that does not allow it would lose every request.
- With no bearer in hosted mode, the refresher is asked once (bridging the boot race), and with no session the call resolves locally to a synthetic signed-out 401 (`signedOutResponse`). Signed-out is an expected state whose surface is the sign-in screen; `isSignedOutEngineError` lets callers skip reporting it.
- A request marked by `@houston/sdk/auth-replay` is refused without waiting for a refresh when there is no bearer, because another account could sign in during the wait, and its 401 is replayed only when the refreshed bearer names the same person (`settleWithoutReplay`).
- `cpFetch` is the JSON wrapper every control-plane module uses: live auth, the active-space header, the reason-aware read retry, and a non-2xx as `HoustonEngineError` carrying the host's reason (`detail`), its `Retry-After` (`retryAfterMs`) and, on `/agents/:id/*`, its `agentId`.

## 401 recovery

- **Refresh seam** (`session-refresh.ts`). The shell installs a refresher on `window.__HOUSTON_SESSION_REFRESH__` so the adapter never imports the auth client. Its answer is three-valued: a token, `null` (the session is gone; answer with the quiet signed-out 401), or a throw (the identity service was unreachable). Flattening the throw to `null` once turned every sleep-wake refresh race into a bogus "invalid or expired token" report. A transient failure becomes a `TypeError` starting "Load failed", which the connectivity classifier keys on, so it surfaces as the one deduped connectivity notice. Refreshes are single-flight, because the refresh token rotates on use and racing refreshes can sign the person out. With no refresher installed, `null` only means nobody to ask (`hasSessionRefresher`).
- **Rejected-bearer memory** (`cp/bearer-recovery.ts`). On a wake burst several reads hold the slept-out token while new tokens are minted on other schedules, so comparing the refreshed bearer only with the one this request sent cannot tell "a sibling already had this exact token refused" from a genuine new mint. The module keeps the last `REJECTED_BEARER_LIMIT` (8) refused bearers. A refresh that returns a known-refused bearer takes the quiet path instead of replaying. An accepted bearer is removed, because a stale verifier key on one gateway replica can refuse a token that is in fact good.
- **Refused fresh mint** (`cp/rejected-mint.ts`). After a wake, N reads share one refresh, replay the new bearer together, and are all refused, while the same session is accepted about a second later. One caller per bearer waits `REJECTED_MINT_VERIFY_DELAY_MS` (1 s) and resends. Accepted heals invisibly and siblings replay; refused again returns the raw 401 to that one caller, so a real fault reports exactly once. Breadcrumb text avoids the word "auth" because Sentry scrubs breadcrumbs that contain it.
- **Refresh timing** (`cp/refresh-bearer.ts`). A 401 that lands one event-loop turn before the refresher is installed gets one extra macrotask, never more. A refreshed bearer whose own `exp` is within `MIN_BEARER_REMAINING_S` (60 s) is not sent; the refresher is asked once more, because a refresh answered on wake can carry a token already dead at the gateway. Only once: a client clock far ahead would make every token look expired, and the gateway stays the judge. `bearer-claims.ts` only decodes claims for breadcrumbs and never logs the token.

## Read retries and what a 5xx means

`cp/unavailable-reason.ts` reads the reason in a 502, 503 or 504 body, because those answers are different events and treating them alike made normal cold starts look like crashes. The body's error string is the contract; detail prose varies per gateway leg and is never read. `Retry-After` says only how long and cannot classify.

- `engine unavailable` (503): the pod is waking. Earns `WAKE_RETRY_DELAYS_MS` (2, 3, 5, 5 s). Each attempt already costs the gateway an ensure-awake leg of up to 8 s, so the ladder covers about 15 s of client wait plus about 40 s of gateway watching, well past a healthy boot. Past it the honest answer is an error.
- `engine proxy failed` (502): the gateway could not dial a pod it believes is running, usually a restart under an engine roll. Same budget as a wake.
- The host's own `RUNTIME_STILL_STARTING` (probe routes answering 503 plus `Retry-After: 2` instead of holding the socket) and `HOST_SHUTTING_DOWN` (a draining host; newer hosts send `engine unavailable` instead) also earn the wake budget.
- `not_configured` codes and `shared skills not configured`: a deployment shape, permanent for the session, so not retried.
- Anything else, including an unreadable body: `HANDOFF_RETRY_DELAYS_MS` (0.5, 1.5 s), sized for a load-balancer handoff.

Retrying a wake to success is not a swallowed failure: the action succeeded a little later. An exhausted budget rethrows verbatim.

`transientRetryFetch` (`cp/transient-retry.ts`) applies this to GET and HEAD and to the idempotent workspace-choice PUT. Writes never blind-retry, because a POST that threw may have reached the gateway; the SDK owns the retries of the writes it knows are safe (first-day start, id-bearing card create). `CALLER_OWNED_RETRY_PATHS` (`/v1/assistant`, `/v1/events`) skip it: assistant discovery runs its own ladder (stacking both turned a waking pod into about 25 requests), and the event stream reconnects itself. The body is classified on a clone so the caller still parses it. An aborted caller ends the ladder immediately.

`cp/retry.ts` adds a second, slower layer (`READ_RETRY_DELAYS_MS`, 1 and 3 s) only for boot reads whose failure has lasting consequence, such as the workspace list that decides the session's space. It is not applied everywhere, because a retry costs latency and the query layer re-triggers most reads cheaply. 4xx answers are terminal.

`runtimeClientFor` and `setupRuntimeClientFor` (`cp/runtime-clients.ts`) use the same live auth and read retry. The setup runtime is cold by definition, and without the wrapper first-run setup took its boot 503 as a failure.

## Classifying failures for the error layer

- `isEngineWakingError` (`engine-waking-error.ts`) keys on exact (status, reason) pairs: gateway `503 engine unavailable`, gateway `502 engine proxy failed`, the host's still-starting and shutting-down reasons. Never a bare 502 or 503. It reads four client error shapes: `HoustonEngineError` (reason prefix in the message), the SDK's `AgentsHttpError` and `ActivitiesHttpError` (raw JSON body as message), and the runtime client's `EngineError` (raw body). Each shape was added after its waking answer reached the bug pipeline. On SDK agent writes only, `502 agent pod unusable` also counts as waking, because the gateway mints it when a rename's round trip to a cold pod fails and logs it itself; on the dispatch path it stays a real error.
- `wakingStuckTracker` (`waking-stuck-tracker.ts`): every waking answer is a low-noise warning, but an agent answering nothing but waking for longer than `WAKING_STUCK_THRESHOLD_MS` (5 minutes, above the gateway's own 300 s hold) is crashlooping or unscheduled, and gets exactly one error-level event per episode with the first and last bodies. An episode breaks on a gap over `WAKING_EPISODE_GAP_MS` (2 minutes) or any successful call, which `cpFetch` and `viaSdk` report.
- `isNetworkTransportError` (`network-transport-error.ts`) gates the bug report, so it must never match a coding-bug `TypeError`; it uses the SDK's `@houston/sdk/transport-failure` message set and unwraps one level of `cause`, never more. The retry check `isTransientEngineError` may match any `TypeError`; this one may not.
- `isOrgAdminRequiredError`: a plain member trying the pre-agent, org-level connect gets the gateway's `403` sentence (no code), matched by status and reason prefix across the three client shapes. It is an informational state.
- `NO_ACTIVE_LOGIN` (`provider-login-session-lost.ts`): the runtime keeps a login in memory, and `400 no active login for <provider>` means that memory is gone (timer, recycled pod, restart mid-consent). The surface shows "link expired"; only that exact pair matches.
- `reportProbeFailure` (`client/provider-probe-report.ts`) reports a failing provider probe once per signature per session, because the picker re-probes every few seconds and would file about a thousand events an hour.
- `AdapterErrorSink` (`error-sink.ts`): a read that degrades and still answers has no caller to throw to, so it reports through the sink the app installs at startup.

## Degradations are the adapter's policy

The SDK never softens a failure and its contract tests pin the raw status. Turning a status into an empty answer is web policy, so it lives in the mixins, keyed on the status:

- `getOrgProfiles`, `getOrgPeople` (`orgs-mixin.ts`), `getMyProfile` (`me-profile-mixin.ts`): off-cloud or 404 gives an empty answer; writes still throw, because a pretend save is a silent failure. `quoteSeat` 404 reads as `no_charge`.
- `getBilling` (`billing-mixin.ts`): off-cloud, 404, 403 and `503 billing not configured` read as null; checkout and portal still throw.
- `listOrgs` (`spaces-mixin.ts`): off-cloud or 404 lists nothing; create, move and invite responses throw off-cloud, because a person who pressed Accept must never be told nothing happened.
- `getAgentModelChoice`, `agentTriggerStatus` (`teams-mixin.ts`), `mintRoutineWebhookKey` (`routines-mixin.ts`): 404 or no gateway reads as null (single-player).
- `listWorkspaces` (`workspaces-mixin.ts`): 404 is capability negotiation and lists personal only. Every other failure throws; an old blanket fallback to personal made a gateway blip hide a Teams person's spaces for the whole session. `deleteWorkspace` throws for the personal row or off-cloud instead of pretending.
- Custom integrations (`custom-routes.ts`): a bare 404 on the definitions or tools read means the feature is absent (hidden section); `{code: "not_found"}` on the tools read is an unknown slug and stays a failure.
- `listInstalledConfigs` and the integration session push skip the request entirely when `deploymentServes` says the flag is `false`, and keep swallowing 404 for older deployments.
- `getCatalog` (`boot-mixin.ts`) has no 404 tolerance: every host and the fake host serve it, and degrading to `[]` once shipped a packaged app with zero models.
- `assistant-mixin.ts` does not believe a 2xx that lacks either id and reports it as a 502, because opening a chat pointed at nothing would fail silently.

`deploymentServes` (`client/host-capabilities.ts`) is tri-state: `false` only when the server says so explicitly. An absent flag or a failed probe resolves `true`, keeping the legacy probe-and-swallow path rather than dropping a request on a guess. The memo is per endpoint and cleared by `setEndpoint`. The declaration lives in `boot-mixin.ts` because the catalog generator scans only `*-mixin.ts` files.

## Which agent provider calls go to

Provider credentials are workspace-central, so any real agent's runtime can serve and capture them; the routing question is only which pod. The persisted `last_agent_id` is not space-aware: right after a switch it names an agent from the previous space, and routing on it sent `/v1/agents/<other-space-agent>/…` under the new `x-houston-org`. That surfaced as empty pickers, reconnect cards that never cleared and a hub that still said Connected (`client/provider-routing.ts`).

- `AgentListState` (`agent-selection.ts`) has three states. `pending`: no list for this space yet; provider calls refuse and the probe reports checking. `unavailable`: a list was asked for and could not be had; routing degrades to the pref so connect and the picker are not bricked, and a later list restores strict validation. `known`: the pref is validated against it. A space switch returns to `pending`, never `unavailable`, because a list is coming. A failed background refresh never downgrades a known list. `noteAgentsUnavailable` covers a boot that never calls `listAgents`.
- `providerAgentId`: the selected agent if the list confirms it, else the first known agent (re-creating a setup pod costs a provision and a lingering Deployment), else `null` for the hidden setup runtime.
- `requireProviderAgentId` is for writes only an agent's runtime holds (the custom endpoint): `pending` is "still loading", a settled empty list is `NoAgentForProviderWriteError`. Credential connect and sign-out never use it; they route pre-agent through the setup runtime. `requireAgentId` is different again: the agent the person has open, for routes where another agent would be the wrong data.
- `withProviderAgentRetarget` (`provider-agent-gone.ts`): a `404 agent not found` (exact reason) forgets that agent and runs once more against the re-resolved target, and emits a workspace-less `AgentsChanged` so the rail re-lists. A second "gone" is final and loud.
- Login pinning (`provider-login-poll.ts`): `pinnedLoginAgentId` recovers the runtime a login started in from its `activeLogins` key. Submit and cancel route by that pin, never re-derive, because the answer moves when onboarding creates the first agent mid-login and the relayed code then landed on a pod that never saw the login. The last matching key wins.
- `isProviderLoginComplete` requires no in-flight login or a `complete` one, not bare `configured`: a stale stored credential reports configured while the new OAuth is still awaiting the person, which once completed onboarding with an AI that never connected. A failed capture before any agent exists is surfaced, because that captured credential is all the next agent inherits.
- Connecting claims the active provider only when the agent has none (`connectApiKey`, `pollProviderConnect`). Setting it unconditionally flipped every open chat onto the new provider. Switching stays the model picker's job.
- Sign-out (`provider-credentials-mixin.ts`) forgets the central credential first, then the runtime's local copy, because the runtime re-pulls from the central store before every turn. It always emits `ProviderLoginComplete` (benign `success: false, error: null`), the one signal that invalidates the shared status query, so a disconnected provider stops counting as connected.
- OpenCode's Zen and Go share one key, so writes and clears fan out to both ids (`credentialSiblings` in `synthetic.ts`) and one completion event fires.
- `pushClaudeCredential` (`provider-claude-push.ts`) resolves the target itself from the space-validated accessor and falls back to the setup runtime when the list is unsettled or empty. A guess at a specific agent is never acceptable.
- `localModelBridgeAccess` (`client/local-model-bridge.ts`) binds to the agent the person has open, not `providerAgentId`, which falls back to the first agent whenever the pref lags.
- `providerStatuses` (`provider-status-mixin.ts`) is one `listProviders` round trip for every card, bounded by `PROBE_TIMEOUT_MS` (15 s) so a wedged host reads as unknown instead of loading forever. An unreachable engine is `unknown`, never `unauthenticated`, which would flip every card to Connect and block the local-model tunnel reconnect. New fields are spread conditionally so older answers keep their exact shape.
- `toNewProvider` and `toOldProvider` (`synthetic.ts`) go through the domain's one alias ladder; only Codex is renamed. The catalog is open (about 35 providers), so unknown ids pass through and the host stays the validity authority. Returning null for uncurated ids once failed key saves before any request.

## The global event stream

`subscribeEvents` (`cp/events.ts`) reads `/v1/events` with fetch and a stream reader, not `EventSource`, because a cross-origin `EventSource` in the Tauri webview never connects. The token rides `?token=` and the space `?org=<slug>`, both re-read per connect, because a browser cannot set headers on the stream.

- The fetch is wrapped, not passed by reference: calling `window.fetch` with a foreign receiver throws "Illegal invocation" before any request, and the stream silently retry-looped forever. Node's fetch does not care, so tests never caught it.
- A 401 forces a session refresh so the next connect carries a valid token; otherwise an idle app 401-loops forever.
- The feed has no replay cursor, so on a reconnect it publishes a transport event and the app's invalidation plan decides what to refetch. `streamedGateways` is module-scoped and keyed by gateway, because the reconnect after the longest gap (a laptop that slept past token expiry) arrives on a brand-new subscription after the client is rebuilt; a per-subscription counter stayed silent exactly then.
- `subscribeWakeSignals` forces a reconnect check on `online` and on visibility returning, because the loop's backoff is capped and a frozen tab's socket looks open.
- Stream errors are log-only: a reconnecting background stream is a connectivity state.
- `toInvalidationEvent` is the one translation to `{ type, data: { agent_path, workspace_id } }`, so `emitLocalEcho` (`bus.ts`) produces byte-identical events. After a successful domain write the adapter echoes the invalidation locally, because the hosted gateway did not forward pod events and a card stayed on running after the reply rendered. It is idempotent and only for writes, never reads or turn frames.
- `EngineWebSocket` (`ws.ts`) is a shim over the in-process bus. A disconnect defers stream teardown one tick, because a token rotation disconnects and reconnects the same client and must not kill a live turn.

## Chat

### Send queue

`maybeQueueSend` and `flushQueuedSends` (`send-queue.ts`) hold a send that arrives while a turn runs and flush the queue as one combined send at settle, so every send path (chat, mission control, skills, onboarding) inherits it.

- The last entry's picker state wins, except fields merged across the queue (`send-queue-merge.ts`): mentions and approval receipts are unioned in first-seen order, because dropping an earlier line's mention or a person's yes would be a real loss; a repeated approval keeps the first answer since the host retires a request once decided. The bubble text is rebuilt like the prompt and carried only when some entry hid its prompt.
- `autoResume` sends (Houston continuing after a reconnect) are held at most once per conversation, swallowed while another is queued or running (`noteAutoResumeStarted`), dropped at flush when the person queued their own message, never shown as a queued bubble, and probed immediately.
- Flush triggers: the dispatched turn's own settle; `settle-watcher.ts` for turns settled by anything else (an observer, a stale-running heal); and `armQueueWatchdog` (`queue-watchdog.ts`), the trigger that cannot die. The watchdog polls history on a backoff while anything is queued. A trailing assistant message or an empty transcript proves no turn is half-open, so it heals `running` and flushes. A trailing user message is inconclusive. It defers to a live turn stream for `LIVE_TURN_GRACE_MS` (90 s), because the cloud pool persists the reply before its terminal frame, and the grace outlasts the gateway's 75 s claim reap. A held send is never flushed over. The session object is the arm's identity, so a disarm and re-arm racing a probe cannot leave two chains.
- `conversationBusy` also counts a send of this client still waiting to go out, because an observer can flip the VM idle while that send waits.
- `pushPendingUserMessage` (`turn-stream.ts`) shows a message before the agent's engine exists; the real send suppresses its own bubble, so this push carries `author` and `mentions`, its only chance to attribute the row.

### Turn pin

`wireTurnPin` (`turn-pin.ts`) maps the chat's own pick to engine ids for every send, so each conversation runs on its own provider. A legacy alias maps; other providers pass through. A model the domain tables do not know passes through verbatim, never dropped: behind the gateway a model-less pin means no pin, and the gateway substitutes the person's stored choice, provider included, which silently moved turns onto a provider nobody picked. A model with no provider is dropped. Effort and mode pass through.

### History windows and seeding

- A chat opens on the last `CHAT_OPEN_WINDOW` (120) messages and prepends `CHAT_OLDER_PAGE` (80) on scroll (`history-window.ts`, `client/load-older.ts`). Full-transcript opens were the main "chat hangs before opening" cost. Mission search reads `SEARCH_SCAN_WINDOW` (400) per mission; a match older than that is not found, a tradeoff taken because full scans took 10 to 15 seconds.
- `decideServerSeed` compares on user-message content, never timestamps, because live pushes use the client clock and history uses the runtime's. It replaces on newer or richer, stamps the window on identical content, and skips when the feed holds an unconfirmed send or loaded pages the fold lacks.
- `seedConversationVm` (`conversation-seed.ts`) never seeds over a live stream's feed, and refuses a read that went out before a turn this client started (`historyReadMark`), because such a fold cannot hold the turn and would replace it. `readPastOwnTurnsOn` retakes those reads.
- Open reads are single-flight (`openLoadsInFlight` in `chat-history-mixin.ts`); bulk reads never join, never observe, never seed and never write the cache. A conversation that 404s with no cache is empty; anything else propagates rather than rendering a fake empty chat.
- `adapter-streams.ts` holds the adapter's own `StreamRegistry`, separate from any SDK's so the two never cross-abort. `vm.ts` holds the adapter's one conversation store.

### Local conversation cache

`conversation-cache.ts` persists folded feeds in IndexedDB (`conversation-cache-idb.ts`) so a cloud chat paints instantly while the gateway holds the read through a cold start. It is best effort by design: an accelerator, never a source of truth, and a storage failure logs once and degrades. That is a deliberate exception to the no-silent-failures rule, because no outcome the person asked for is swallowed.

- Keys are per gateway and per user (`conversationCacheScope`), and a bearer without a user disables caching. Sign-out clears the store. Local engines never cache.
- `trimForCache` cuts at a user-message boundary within `CACHE_FRAME_BUDGET` (360 frames), so a paint never starts mid-turn, unless one turn exceeds `CACHE_FRAME_HARD_MAX` (600). Frames keep `ts`, `author`, `mentions`, `turnId`, `toolIndex` and `notice`, so a painted feed stays attributed and dedupable. The prune sweep reads keys only.
- `cachePersistOutput` (`cache-persist.ts`) snapshots the feed when a turn settles, not on the early hand-back.
- A 404 with a cached transcript serves and keeps the cache (`cachedFallbackTranscript`), because a pod can answer 404 while its data is being restored; a deleted chat leaves the list, so nothing reopens its ghost.

### Board status writes

`setActivityStatus` (`client/activity-status.ts`) writes where the board reads (the host in cloud). The turn's settle write must land, or the card sticks on running, so it retries: the PATCH is idempotent. `turnCardWriter` remembers the card id across one turn's writes and forgets it after a failed PATCH. `createBusFeedOutput` (`feed-output.ts`) shows a failed board write as a system line except for the waking and connectivity classes, which the settle re-persists anyway, and for provisional writes. It remaps provider ids to the app's dialect on the way out.

### Stop and controls

`ChatControlsMixin` (`client/chat-controls-mixin.ts`): Stop on a turn the engine says was not in flight settles the stuck card itself (orphan rescue); a live turn is settled by its own stream, and writing too would race it. A message still waiting to go out stops locally first.

## Agent colours

Colour is a device pick stored in a local overlay (`cp/agent-color.ts`) and mirrored to the `agent_colors` account preference (`cp/agent-color-sync.ts`), because sign-out purges account-scoped local keys and every agent came back default purple. Every `listAgents` reconciles both in the same round trip (`readAgentList`), so colours set on another device or by the AI Manager's `updateAgentColor` appear.

- Entries only one side holds survive. For shared ids, the device wins while it owes the account a write (`devicePending`), and the account wins once it accepted that exact map. A pick made while a read was in flight makes that read stale (`deviceWrites`).
- Pushes are serialized, and a write during an in-flight PUT queues one follow-up with the freshest overlay. Hydration writes are silent so a server read never echoes back as a write.
- `resetAgentColorSync` runs on `setEndpoint`, because the repointed client may now speak for a different account.
- Colour falls back from the overlay to the host's Rust-era colour, then the default. Rename carries the overlay to the new id, because the local store derives ids from paths; delete removes it so a reused id cannot inherit it. A stored colour is a palette id, never a hex (`DEFAULT_AGENT_COLOR`).

## Other bindings

- **Workspaces** (`workspaces-mixin.ts`, `wire-workspace-id.ts`): the synthetic `default` personal row replaces the served one, because its id is load-bearing for prefs, caches and desktop boot; only `org:` rows bridge through. No server speaks `default`, so `WorkspaceIdResolver` translates it once per client and drops a cached rejection so a blip does not wedge the session. `setWorkspaceLocale` writes the account `locale` preference.
- **Preferences** (`config-prefs-mixin.ts`): account keys go through the SDK. A pre-fix device copy of an account key is lifted to the host once and removed, so a chosen timezone survives; failures of that lift are diagnostics, because the host already answered. `null` clears rather than storing the string "null". Per-agent settings go through the agent's runtime client; the host root has no `/settings` and a write there silently 404s.
- **Config mirroring** (`agent-files-mixin.ts`, `configWriteToSettings` in `synthetic.ts`): the runtime resolves the model from its own settings, but the picker writes `.houston/config/config.json`, so a config write is mirrored into the runtime's settings. A doc with only effort still forwards effort. A mirror failure is reported but does not fail the write, because every send carries the pin anyway.
- **Uploads** (`client/attachment-batches.ts`): `File` and `webkitRelativePath` are DOM types, so batching stays here and the SDK receives named Blobs. Small files batch up to `BATCH_BUDGET_BYTES` (8 MiB); requests stay sequential so per-file dedupe on the host never races.
- **Portable agents** (`portable.ts`, `portable-install.ts`): an uploaded `.houstonagent` is unpacked and scanned in the browser with the same `@houston/domain` code the host runs, parked in memory, and installed as an ordinary create with seeds, so nothing is staged server-side and both backends support it. An install never keeps the package's routine ids, and a stored hex colour is canonicalized to its palette id.
- **Channels and LinkedIn** (`channels-mixin.ts`, `linkedin-mixin.ts`): answers are parsed with `@houston/wire-types` guards before reaching a screen, and external URLs are restricted to the providers' own pages. Completing a connect redeems the ticket on the app's own session, which is what binds the account to the signed-in person; a mangled ticket never becomes a request.
- **Credential capture retry** (`client/provider-capture-retry.ts`) replays the whole capture after an ambiguous response, which is safe because the host made capture idempotent.
- **Login failures** (`client/provider-login-failure.ts`): a typed runtime `kind` (such as the Codex sign-in port being held) is mapped to a localized sentinel and surfaced through `ProviderLoginComplete`; untyped failures keep their existing path. Login URLs open only through the bus event, because a direct `window.open` double-opened beside the handlers and did nothing in WKWebView.
- **Page lifecycle** (`page-lifecycle.ts`): `beforeunload` marks leaving, because Firefox cancels fetches then; `pagehide` covers iOS. Live again on `pageshow`, on visibility returning, or `UNLOAD_CANCELLED_AFTER_MS` (2 s) after a `beforeunload` with no `pagehide`. That last guess can be wrong on a slow reload, and the SDK's import hold tolerates it.
- **Boot** (`boot-mixin.ts`): version is read from `/v1/version`, not the runtime's `/version`, which only pi serves. Capabilities are re-fetched after a space switch because `role` is per space.
- `synthetic.ts`'s personal row carries no provider, because labelling it meant reading one agent's providers on every space-list poll and that agent never slept.

# Host: design decisions

Covers `packages/host/`, the protocol v3 host server, and records what its code alone does not show: route families, the AI Manager dispatcher, integrations, turns and files, runtime channels and launchers, credential stores, the routine scheduler, the Vfs and store sync, boot migrations, providers and the local host profile. Paths are relative to `packages/host/`, and each section names the file and symbol where its rule lives.

## Server, capabilities and route registry

### Admin seam

Lives in `src/admin-seam.ts` (`MountAdmin`). The open server accepts an injected request hook after the events stream and never imports an admin route. Nothing in-tree binds it; it stays as the extension point for a private deployment. Unset, `/admin/*` 404s like any unmounted route. True stops routing, false falls through.

### Capability profiles

Lives in `src/capabilities.ts` (`LOCAL_CAPABILITIES`, `CLOUD_CAPABILITIES`, `MANAGED_CLOUD_CAPABILITIES`). One source of truth for the host, the sidecar entry and the parity gate; the UI gates on these flags, never on platform. Deliberate asymmetries only: local has the Tauri shell and the user's machine. Every profile offers the same providers and the BYO endpoint; managed pods validate it to public 443. `providers` is a hint derived from pi-ai's registry (plus Houston's qwen provider), so it cannot drift; the authoritative list is `/v1/catalog`. `integrations` is nominal; wiring overrides it with what is configured. Tunnel is off everywhere (phones use the web app). The managed gateway has no org skill store yet. Managed pods run bash in the single-tenant, network-policied container, the same posture as self-host.

### Dual-profile parity gate

Pinned by `src/dual-profile.test.ts`. One host and two adapter profiles: the same handlers and domain code compiled into local and cloud, differing only in the adapters `main()` wires. This boots both over HTTP with in-memory or temp-fs adapters and drives an identical request battery (single-owner happy paths, validation 400s, 404s, the duplicate-skill 409, a strict 400 on a malformed Claude push, skills, learnings raw-write and typed-read, a portable export and preview, rename last because local renames change the id). Ids, timestamps and `created_by` are normalized; `dir` is the one documented payload asymmetry (local only, for OS reveal). Step labels and normalized steps must be identical. Capability asymmetries are pinned exactly: profile, desktop shell and machine versus the egress-locked sandbox; Composio availability is config-driven; custom OAuth and the morning briefing are deployment-derived; only the per-turn gateway titles missions on send; providers are the same on both, including the BYO endpoint (cloud validates it at save); tunnel is gone and there is one protocol version. Cross-user 403 and the workspaces list are deliberately excluded (local is single-user, so an unknown token is 401 at identity).

### Events stream

`/v1/events` delivers each mutation's `HoustonEvent` to the owner's stream only, never another tenant's. Clients trigger work only after the preamble comment arrives.

### Per-agent route plumbing

Lives in `src/routes/agent-authz.ts` (`AgentRouteDeps`, `authorizeAgent`, `channelFor`, `trustedActingAs`).

A workspace runtime with no channel answers 503; no vfs makes the typed families 503; no event hub means mutations emit nothing.

`agentDir` is serialized as `dir` on local agent payloads so the desktop can reveal the folder; the agent id is a route key, not a path.

`loopbackEgress` is set only by the dev launcher, whose pods are local processes; real managed pods never set it, so endpoint validation models their real egress.

`storeSyncFlush` pushes the pod tree now for writes the gateway reads back immediately (the local-model endpoint file).

`agentRequestCount` counts held `/agents/*` requests, including long-lived SSE streams, so the idle sweep does not sleep a pod someone is watching. It excludes `/v1/events`, which the gateway's fan-in holds open for every awake pod whenever the app is open; counting it would defeat idle sleep. `agentWriteCount` counts the non-GET/HEAD/OPTIONS subset.

`triggersEnabled` means a trigger backend (Composio project key plus public webhook URL) exists, true on Houston Cloud only. It is distinct from the client-facing `capabilities.triggers`, which the gateway advertises at its edge.

`trustedActingAs` is the one gate for reading the acting header on per-agent routes, so no route reads it itself. It is honored only behind the gateway, which mints it; pods cannot verify the signature.

### Events stream route

Lives in `src/routes/events-stream.ts`. Opened with the shared SSE opener (full headers plus heartbeat), strictly scoped to the user, one `HoustonEvent` per frame. The handler returns once the stream is open; the client's disconnect closes it.

### HTTP helpers

Lives in `src/routes/http.ts`. One byte-capped body reader for all routes. `optionalTrimmed` turns whitespace-only and non-strings into `undefined`. `methodNotAllowed` emits exactly the dispatcher's 405 body so both paths answer alike. `bearer` accepts `?token=` for SSE. `header` collapses arrays to the first value.

### Meta routes

Lives in `src/routes/meta.ts`. Health and the v3 descriptors are public because the UI reads them before sign-in and capabilities are not secrets (`infra`, not SDK). The host version is a build-time constant from `package.json`, inlined by esbuild, so it cannot drift; the cloud update manager compares pods against it. `build` is `BUILD_SHA` baked by `engine-pod-image.yml`, null elsewhere. `/health` is the engine pod's readiness probe; a pod that lost its store lease answers 503 so it leaves the Service and retires or stands down (`local/fence-retire.ts`).

### Request body cap

Pinned by `src/routes/read-body.test.ts`. `readBody` drains with a running cap and rejects with 413 mid-stream, so an oversized or slow body is never buffered whole; a declared Content-Length is checked first but never trusted.

Lives in `src/routes/read-body.ts`. `MAX_JSON_BYTES` is 4 MiB, far above any settings, message or credential payload; upload routes pass a larger explicit cap (`files-import.ts`). `BodyTooLargeError` carries 413. A declared Content-Length over the cap is rejected up front, but the running total is the real guard, since the header is client-controlled and absent on chunked bodies; crossing the cap destroys the stream. An empty body reads as `{}`.

### Route registry ordering

Lives in `src/routes/registry/` and `server-phases.ts`.

Registration order is match order. A route is unreachable when an earlier pattern covers all its paths for a shared method. Any such pair must be listed in `INTENTIONAL_SHADOWS` with a real written reason; an undeclared or placeholder-excused shadow is dead code and fails. Shadowing is judged on the patterns the matcher tries, not `listRoutes()`, because a proxy family publishes descriptors while matching `/agents/:agentId/*rest` for every method.

Every group in `GROUP_PHASES` must have a registered route module, or server.ts calls a slot that never answers.

`server-phases.ts` walks the table one segment at a time, so each phase's groups must be contiguous and in pipeline order; a misplaced group would run in the wrong phase with the wrong context.

An agent-phase family refuses a stranger before revealing which methods it accepts (no 405 to strangers).

### Registry barrel

Lives in `src/routes/registry/all.ts`. Imports every declaring module for its side effect so server.ts and the parity gate see the whole registry. Import order is not match order (that is `GROUP_PHASES`), except that the runtime proxy is imported last for readability.

### Family boundaries that answer for themselves

Setup runtime (`setup-runtime-boundary.test.ts`): the family claims the whole `/setup-runtime` subtree because its 404 (closed here) and 503 (runtime unwired, before the allowlist) are answers owed to a pre-agent client.

Transcript shadow (`transcripts-sandbox-boundary.test.ts`): claims the conversation prefix including undecodable ids, so a runtime with a valid token never meets the 401 wall; the token check still runs first.

Migration (`migration-routes.ts`): owns the whole `migration/` prefix so unknown paths never reach the runtime. `/agents/:agentId/migration` alone is outside the prefix and falls through. Sessions are anchored with `agentDir` only where there is an on-disk tree. The importer follows the routine-write actor policy.

### Handler context

Lives in `src/routes/registry/context.ts`. Separate from declarations so the dependency runs one way. The agent entry takes the narrower per-agent deps bag; every `ControlPlaneDeps` satisfies it. `path` is the raw undecoded pathname. The acting identity is decided once by the dispatcher (`trustedActingAs`), so no per-agent route reads the header itself. Optional context fields are present exactly when the phase says, enforced by `GROUP_PHASES`, `register()` and `dispatchGroup`'s overloads.

### Proxy family

Lives in `src/routes/registry/define.ts` (`defineProxyFamily`). The catch-all forward to an agent's runtime matches `*rest` for every method, so unlisted rests still reach the channel, while the declared members are what the SDK parity gate reads.

### Route registration

Lives in `src/routes/registry/define.ts`. Routes register once at import time, so every check fails the process at boot. An owned path widens the pattern a member already declared instead of adding a second pattern the matcher would reach later.

Lives in `src/routes/registry/types.ts`.

Phases: `public` (before any auth), `sandbox` (the handler validates its own HMAC token), `user` (after the 401 wall and the agents store fence), `agent` (user plus `authorizeAgent` run by the dispatcher). Order within a phase is declaration order. Sandbox token checks stay inside each family's handler; lifting them into the dispatcher would move every sandbox family's refusal at once.

`MethodMismatch`: both answers exist on purpose, per handler (`account.ts` falls through to the 404, `agent-color.ts` 405s). The dispatcher's 405 body is exactly `{ error: "method not allowed" }`; a family whose 405 carries more (a `code`) owns every method and answers itself. An agent-phase 405 comes after the ownership check; a user-phase one answers before any per-agent check.

Path syntax: `:name` is one decoded segment, `*rest` is one or more segments.

Only the `sdk` classification needs no written reason.

A handler returning `false` declines and the chain walks on; this is how a family claiming a wider boundary (`owns`) gives back targets that are not its own. `Answer` includes `void` because an async handler with no return has type `Promise<void>`, which `undefined` would reject.

`RouteFamilyDef` is spelled out rather than `Omit<RouteDef, ...>`, because `RouteDef` is a union and `Omit` over a union erases the per-phase handler signature.

`owns` patterns answer every method without publishing descriptors.

Proxy family `members` come from the runtime's transport routes and `turn/dispatch.ts`; parity rule R4 checks them against the client.

### Route registry dispatch

Lives in `src/routes/registry/dispatch.ts`.

The registry readers are reached only through `./all`, which imports every declaring module; reading elsewhere yields a partial chain instead of an error.

Each group is one chain slot, so calling groups in table order is the chain order. Overloads tie each group to its phase's context.

A handler that declines makes the chain skip that entry's other patterns, which would reach the same handler.

A family owns its path set: a wrong method anywhere in it gets the family's 405. An agent-phase family writes its 405 after the ownership check, so non-owners see 403 or 404.

Emits target the workspace owner.

`listRoutes` is pure data so the SDK parity gate reads it without booting a server.

### Dispatch groups table

Lives in `src/routes/registry/groups.ts` (`GROUP_PHASES`). This table is the chain: position is match order, and phases run public plus sandbox, then user, then agent, each contiguous. Notable placements:

`meta` and `catalog` are public: capabilities are not secrets and the UI reads them before sign-in; the pi model catalog is static and the same everywhere.

`custom-oauth-callback` is public but sits among the sandbox families, because its single-use `state` is the whole authentication and the browser holds no bearer.

`migration-source` is desktop-local; the gateway proxies only agent-scoped routes.

`custom-integrations` precedes `integrations`, which claims the whole subtree.

`trigger-events` and routine fires precede per-agent dispatch because the runtime has no such routes.

`agent-color` is user-phase (see the color route).

`agent-integrations` declines unknown targets so the engine answers the rest of `integrations/`.

`agent-proxy` is last: it claims every remaining `/agents/:agentId/…` path for the engine.

`PRE_AUTH_GROUPS` joins public and sandbox in one segment because both run before the 401 wall with the same entry context.

### Path matcher

Lives in `src/routes/registry/match.ts` (`matchPath`, `generalises`).

Deliberately simple: segment-wise comparison, registration order is match order, nothing normalized. `/agents/` matches nothing (the agent dispatch needs a non-empty rest); folding the trailing slash would start proxying it. A trailing slash is an extra empty segment and a non-match unless a family `owns` it.

`:name` captures one non-empty segment and is decoded; an undecodable escape makes the pattern miss and the path falls through (the chain 404, or the agent's engine for agent-scoped paths). Authorization is unaffected, since an undecodable agent id misses every agent-phase pattern.

`*rest` captures a non-empty remainder raw, because the channel forwards the bytes as received.

`generalises` compares patterns structurally (a parameter covers any literal segment but never a multi-segment rest) for the shadowing test, never by sampling.

### Golden route probes

Lives in `src/routes/routes.golden-probes*.ts`. The probe set the golden replay uses, grouped by phase, because only user- and agent-phase paths get unauthenticated and wrong-user probes. Entries are patterns; `testing/route-replay.ts` substitutes real ids and keys recordings by pattern, so the baseline survives fresh ids per run.

Pinned by `src/routes/routes-golden.test.ts`. Every probe is replayed against a real host and its answer recorded (status, content type, error vocabulary, body shape, and which request reached the runtime proxy, which shows which handler won). `routes.golden.json` is that answer set; re-record with `HOUSTON_ROUTES_GOLDEN=update` only for a justified difference. Compared as data and then as text, since key order is committed.

### Store fence gate

Lives in `src/routes/store-fence-gate*.ts`.

Fenced writes include agent data outside `/agents/` (color, delegation, custom integrations, whose reads also go by POST but write nothing). The credential serve and integration proxy never touch the tree. User-facing routes are gated after auth, not here.

A write the lease check says can no longer land is refused before touching disk, without the gateway's waking shape (no `Retry-After`), so the client shows a real failure. The sync may have seen no 409 since the takeover, so only the lease check knows.

Reads never cost a check and are never fenced.

An acknowledged write ships to the store right away, under the lease just checked: the watcher skips the workspaces subtree and the periodic pass is minutes out, so a takeover in between would lose it. Refused or failed writes and reads never ship.

Lives in `src/routes/store-fence-gate.ts`. A managed pod claims a per-agent write lease at boot; when a newer boot takes it, the store answers this pod's syncs with 409 and the sync daemon halts. The gateway can still proxy writes to the old pod, which would land on its disk and vanish at recycle (a routine edit reverted days later). So agent-data writes are refused with a distinct 503 reason (not the waking shape), reported once per process, and the pod retires (`local/fence-retire.ts`). Gating order follows the server: sandbox write families (routines, learnings, missions, custom-integration definitions) before their HMAC routes, authenticated mutations only after the bearer is verified, so anonymous callers still get 401. Fenced writes include color, delegation, custom integrations, workspace and preferences.

### Server phases

Lives in `src/server-phases.ts`. The chain is walked segment by segment over the groups table, so no group is reached out of turn or forgotten. Non-route gates run in front of named groups: the coordinator scope gate before the sandbox families, the store fence gate ahead of every pre-auth group (and after the 401 wall for authenticated writes), and the admin seam after the events stream and before user resources. The agent segment's last group claims the rest of the subtree for the engine, so host-served routes exist only by sitting above it. `rememberAddressedAgent` records the agent an authenticated `/agents/<id>/` request names (the doc shadow's binding signal), after auth only so an anonymous caller can never pick the binding.

### Server access boundary

Pinned by `src/server.test.ts`. Personal tier: a user sees and controls all their own agents with no permission layer, and another user is walled off (403); agent-to-agent isolation is the sandbox's job. The refresh token never leaves the control plane. A capture whose central PUT landed settles even if the scrub fails. Forget empties the central store so the runtime cannot re-hydrate. The API-key gate is derived from pi: any provider pi can run with a pasted key connects; OAuth providers (Anthropic) and unknown ids are refused before any channel call. Templates' `claudeMd` and `seeds` are written under the agent root and served back by the skills routes. `mountAdmin` is a request hook mounted after auth: unmounted, `/admin/*` is 404; mounted, it gets the verified user id, its answer is final, and a decline falls through. `BUILD_SHA` unset or empty reads as null and is read per request. The local single-user verifier rejects wrong or missing tokens, so loopback neighbors cannot drive agents. A serve sync during a rename latch or a roll answers the waking shape, not "not connected" or a 500.

Lives in `src/server.ts` (`createControlPlaneServer`).

CORS allows the desktop's `X-Houston-App-Version` header and exposes `Retry-After`, which is not CORS-safelisted, so cross-origin clients can read the retry hint on 503s.

Pipeline: CORS, the pre-auth segment, the 401 wall, then the authenticated segments, as `registry/groups.ts` orders them.

`/agents/*` requests (SSE included) are counted so the idle sweep never sleeps a pod with an open stream; `close` fires on completion and severed connections, so every increment has one decrement. Writes are counted until the response closes and the handler settles, since handlers can keep writing after the client leaves.

View routes' 200 JSON answers under the cap are teed into the doc store for asleep reads.

Errors: `BodyTooLargeError` is 413 and closes the connection (unread bytes would poison keep-alive); a closed launcher or rename latch answers the waking shape (503 with `Retry-After`); everything else is 500. A socket already torn down gets no response.

`healthBody` is re-exported because the health shape is part of the published surface.

### Route probe set

Lives in `src/testing/route-probes.ts` (`probeCases`). Deterministic and de-duplicated, keyed by pattern. Derived sets make "which handler won" observable: every undeclared method under every credential (pinning 405 versus 404 versus proxied, and that a family 405s only behind its ownership check); the trailing-slash form of every pair (the chain does not normalize); HEAD and OPTIONS on named paths, one per shape, because a sampled stride would re-aim when routes are added (a named path that disappears fails); the 401, 403 and 404 ladder; a query string must not change the claiming handler; malformed paths (an undecodable escape, an empty segment) must be refused structurally.

### Replay host

Lives in `src/testing/route-replay-host.ts`. Deliberately partial: optional deps (integrations, custom integrations, transcript shadow, trigger locks) are absent so their routes answer the 404 or 503 they give on hosts without them. Alice owns one agent, Bob none. Outbound fetch is fenced to loopback so the baseline never depends on the network (GitHub, the Agent Store, the integration provider).

### Route replay

Lives in `src/testing/route-replay.ts` (`replayRoutes`). Each probe records status, content type, the JSON `error` field, sorted body keys and every request the recording runtime proxy saw (the full list, so double forwards show). "timeout" (the host holding the request open) and "error" (the request failing outright) are kept apart. Streams are judged by headers and cut. Every probe runs against a fresh host so the baseline is order-free and a diff is always a routing change. The legacy raw-zip migration probe is kept beside the JSON ones.

### Runtime transport route scan

Lives in `src/testing/runtime-transport-routes.ts`. Reads the pi runtime transport sources to list what it serves, because the host's proxy member list and the runtime's routes live in two packages nothing links. The transport files share one grammar (literal pairs, early-return pairs, `path.match` pattern pairs, and `action` alternations), so a source pass works without booting the runtime. Anything written another way is invisible, which is why the comparison is equality against a hand list rather than a subset. Files are read from the directory (flat; `*.test.ts` excluded so a test asserting a 404 is not a route).

### Smaller rules

`registry/index.ts`: the declaring door cannot read the registry back; readers come only from `./all`.

`src/events/hub.ts` (`EventHub`): per-user fan-out on `/v1/events`, keyed by user so tenants never see each other's events, over the publish and subscribe subset of TurnBus. Emit is fire-and-forget because the mutation already succeeded; a publish failure is logged and the UI refetches on focus. A non-JSON frame on a user channel never throws.

`src/shutdown.ts`: SIGTERM stops accepting and finishes in-flight work; idle keep-alive sockets are closed; SSE streams never end, so a grace timer (default 20 seconds) forces exit and clients reconnect and catch up via `sync`; a second signal never double-closes.

`src/sse.ts` (`openSSE`): the one host SSE opener: `no-transform` and `X-Accel-Buffering: no` defeat proxy buffering, `setNoDelay` defeats Nagle (a terminal `done` must never sit in a buffer), an immediate comment flushes headers, and a 15-second comment heartbeat keeps proxies from idling the stream.

`src/routes/meta.ts` (`healthBody`): `fenced` is what makes readiness answer 503.

## Routes: agents

### Agent color (`/v1/agents/:id/color`)

Lives in `src/routes/agent-color*.ts`. The color lands in the same `agent_colors` account preference the app's color sync owns, so the app and the assistant never disagree. A malformed color on create is cosmetic: the agent is still created. The map follows id changes on rename and drops deleted ids, since local ids are paths and can be reused.

Lives in the color helpers used by `src/routes/agent-color*.ts` and agent create, rename and delete. One `agent_colors` map per account, written from several places, so every write is a whole-map read-modify-write under a lock (colors are set in bursts). Every writer addresses the caller's personal workspace, because that is how `/v1/preferences/:key` resolves it.

Lives in `src/routes/agent-color.ts`.

The personal assistant changes a color with one request and cannot merge the whole map itself, so the host does the read-modify-write on the same `agent_colors` preference the app owns. The Rust-era per-agent `.houston/agent.json` color is a read-only legacy fallback (`agent-legacy-color.ts`).

`parseAgentColorMap` mirrors the app's `parseAccountColors` (absent or corrupt reads empty, only string to string entries survive), because both parse the same bytes.

`agentColorOrNull` checks shape only (max 64 characters). The palette enum is enforced by the catalog's parameter schema, and users already have raw hex colors from before palettes.

`updatePreference` serializes per preference document; different accounts never wait on each other.

The route is user-phase although an agent is in its path: it is mounted before per-agent dispatch and answers a wrong method with 405 before any ownership check, so it runs `authorizeAgent` itself.

### Config write lock

Lives in `src/routes/agent-config-write.ts` (`withConfigLock`, `writeSurfaceConfig`, `writeSurfaceConfigText`). Every host-side config write takes one lock, so the first-day merge and a surface's whole-config write never interleave. Surface writes keep the host-owned first-day fields (`keepHostOwnedConfig`). A non-object body is stored as sent (the read side reports it). The raw document route stores the bytes unchanged when they already agree with the host-owned fields.

### Agent config library

Lives in `src/routes/agent-configs.ts`. Entries inline `CLAUDE.md`; an embedded `claudeMd` wins over the sibling file; a malformed manifest hides only its own entry. Install fetches the repo's `houston.json` from GitHub's main branch.

The library of user-added `houston.json` templates (from GitHub repos) merges into the create-agent picker beside bundled templates. Layout under `root(userId)` mirrors the legacy `~/.houston/agents` tree so desktop users keep installed configs: `<root>/<id>/houston.json` (required), `CLAUDE.md` (optional), `.source.json` (provenance). Ids are a single safe path segment. Repo files are fetched from `main`, then `master`. The create flow seeds `CLAUDE.md` client-side, so the list inlines the sibling file. A failed `CLAUDE.md` fetch fails the install instead of writing a half entry. No library wired lists empty, but install fails loudly.

### Create rollback

Lives in `src/routes/agent-create-rollback.ts` (`seedOrRollBack`). Schemas, `CLAUDE.md` and seeds run as one step; a failure deletes the record and folder (a half-made agent would hold the name and refuse retries with `name_taken`) and rethrows the original error. The store refuses taken names, so the rollback only reaches a folder this request created. The record is deleted first, because the desktop store resolves an agent by its folder; `deletePrefix` then clears leftovers. A failed rollback logs the orphan.

### First day (`/agents/:agentId/first-day`)

Lives in `src/routes/agent-first-day*.ts`. The one way an employee's first day starts. Two starts make one setup task. "Started" is recorded only once the first turn fired; a failed first turn keeps the first day pending with no card left. The first turn runs on the hire's pin, in the user's language, hidden from the transcript. The pending first day is created with the agent. Refusals are domain 409s, never gateway statuses the transport would retry. A signed-out saved provider is named in the refusal.

Lives in `src/routes/agent-first-day-start.ts`.

The whole start runs under the employee's first-day lock, so a second start waits and finds the first one's task.

The task is created and its first turn fired before the start is recorded, so a failed start leaves the first day pending and no card, and a recorded start always has a running task. A task that exists while config still says pending gets its first turn and the record, never a second task, and is never removed; when the agent is busy with that task's conversation, the first day is under way and is recorded. Only a task this call created is dropped on failure. A record failing after an accepted turn can greet twice on the next start, which beats a recorded start with nothing running.

No connected AI is an expected state with its own code and authored text, so the surface offers the connect flow. Refusals are 409, never 5xx, because the transport retries 5xx on this idempotent write and would fire the turn again.

Lives in `src/routes/agent-first-day.ts`. Locale and title are capped at 200 characters. The pool worker shares the input parser and task builder; the gateway completes its start with claimed board and config writes. The first turn acts under the routine-fire acting policy (`routineActorFor`) and the gateway's plan limits, trusted only behind the gateway.

Lives in `src/routes/agent-first-day-turn.ts` (`fireFirstTurn`). The setup task has an empty description, so nothing of the hidden prompt surfaces on the card; default title "Getting set up". The prompt is wrapped with `encodeAutoContinue` so the transcript folds it out on live and reload. Effort is low: one question card needs no deliberation and the user is waiting on the hello. First-day records (`agent-first-day-records.ts`) take the same per-document locks as every other writer.

### Legacy agent color

Lives in `src/routes/agent-legacy-color.ts` (`legacyAgentColor`). The Rust engine stored each agent's color in `.houston/agent.json` (`AgentMeta.color`). The v3 agent model is id and name only, and color became a client overlay, so upgraded agents fell back to the default. The host serves the old value read-only on agent payloads (list, rename, migration source). The client's overlay outranks it and the host never writes the file. Every failure reads as no color; a corrupt file is logged, never thrown.

### Reserved and taken names

Lives in `src/routes/agent-name-reserved.ts` and `agent-name-taken.ts`. `name_reserved` (400) and `name_taken` (409) carry protocol codes the SDK classifies on (`isAgentNameReserved`, `isAgentNameTaken`). The reserved check applies only where this host is the edge; `currentName` lets an employee that already holds the name keep it.

### Origin agent rewrite

Lives in `src/routes/agent-origin-rename.ts`. Local ids can be reused, so `origin_agent` provenance is rewritten on rename and cleared on delete. `editRawAgentEntry` edits one policy entry and leaves neighbouring entries byte-identical.

### Agent reference ladder

Lives in `src/routes/agent-refs.ts` (`matchAgentRefs`). One ladder for every surface that lets a caller name an agent, because two surfaces spelling references differently means acting on the wrong agent. Candidates are flat references, since a remote agent is known only by its gateway-reported slug and space. Tiers, case-insensitive, most specific first: id (unique, so a hit is the answer), `<Space>/<Agent>` with the space by name or id, bare name. A bare name two spaces share is two answers and the caller refuses rather than guesses.

### Agent rename policy lock

Lives in `src/routes/agent-rename-policy.ts` (`withAgentPolicyLock`). Agent identity changes and policy writes for one workspace are serialized under a separate key spanning the directory move, because the policy helpers take their document lock themselves and cannot re-enter it.

### Agent seeds

Lives in the seed writer used by agent create (`writeAgentSeeds`). A client-named routine creator is never kept, since the routine would fire as that person. Only the routines document is parsed and stamped; a malformed one is stored verbatim so the read path reports it.

Lives in `src/routes/agent-seed.ts`.

`safeSeedKey`: seed maps are client input on `POST /agents`, so absolute paths, empty keys, backslashes, NUL and any `.`, `..` or empty segment are refused.

`stampRoutineCreator`: a routine fires as its `created_by`, so the server sets it on every client-supplied routines document (the family file and its flat pre-v0.4 twin the boot migration moves): each entry gets the verified actor, or the field is dropped (authorless routines are not fireable). The document is parsed as every reader parses it (`parseJsonDoc`, tolerating a BOM or trailing bytes); an unparseable or non-array document is stored verbatim so `normalizeRoutines` reports it. Migration imports use the same stamping (`importedFileBytes`).

`writeAgentSeeds` honors the same `seeds` contract the wire `CreateAgent` carries, so non-AI agents (templates, portable installs) get their instructions and skills. A key that resolves outside the agent root throws, failing the create loudly instead of half-provisioning.

Lives in `src/routes/agent-seed-tree.ts` (`seedAgentTree`). Writes the `.houston` JSON schemas (so the agent and tools can validate), then `CLAUDE.md` and seeds, with rollback. The pod's `POST /agents` and the pool worker's `seed` op both run it, so an agent seeded while asleep has the same files.

### Agent rename and delete

Lives in `src/routes/agents*.ts` and `agent-state-cleanup.ts`.

A rename runs the store rename inside the channel's quiesced span: the runtime is stopped with a confirmed exit and the id is latched against respawn until the directory has moved. Otherwise the warm runtime's absolute paths, or a reconnect storm booting a new runtime, resurrect the old folder and the rename appears to revert. A quiesce failure is surfaced instead of renaming under a live runtime. A channel without `quiesce` (per-turn) still renames.

Delete quiesces first, then tears down and drops the record inside the latch.

A local agent's id is its `<Workspace>/<Agent>` path, so rename and delete free the id for reuse. Everything held in memory under that id (approval receipts, fan-out budget) is dropped with it.

The legacy color rides rename and list payloads.

### Turn body on the send path

Lives in `src/routes/agents*.ts` (the conversation messages dispatch).

An HTTP body can be read once. The host drains the turn body for the mode pin, the mentions and the approval receipts, and every seam reuses that one buffer; a second read returns nothing and the runtime would get an empty message.

Approvals are host-owned everywhere, so the body is drained on every deployment; only Teams attribution is gated on a gateway-vouched actor.

On a pod the coordinator is an ordinarily named agent, recognized by the identity the gateway stamped into the pod environment (`launcher/assistant-role.ts`).

A send without a mode pin runs on the mode the card keeps; the host's plan gate reads the same answer. The send's own pin wins. Plan limits (floors) follow the person's current plan at each send.

### Agent names

Lives in `src/routes/agents*.ts`.

Create, portable install and rename refuse a name another employee holds before touching disk, case-insensitively (macOS and Windows folders are case-insensitive), with one 409 shape. Reusing the folder used to overwrite the other employee and a failed seed's rollback deleted it.

"Houston" is the AI Manager's name: create, install and rename answer 400 `name_reserved` where this host is the user-facing edge. Existing holders and migrations keep it, and behind the gateway the host never refuses it, since the gateway enforces the rule and seeds pods under their registered names.

Create rolls back the record and folder when seeding fails, so the onboarding retry (list then reuse) recreates cleanly.

### Agent list and create

Lives in `src/routes/agents-crud.ts`. The personal workspace is auto-provisioned on first hit. Name validation here is the wire backstop for surface validation (a clean 400 instead of a store 500). `migration: true` (the desktop to cloud move) keeps a reserved name, but the taken check still applies. Seeds and `CLAUDE.md` are client input and are validated. Seeding is skipped only when no vfs is wired. Seeded routines do not go through `createRoutine`, so they are stamped with `routineActorFor`. A create-time color goes to the `agent_colors` preference; absent or malformed is not stored, but a real write failure propagates.

### Agent modify

Lives in `src/routes/agents-modify.ts`. A live runtime holds paths into its agent directory during rename and delete, so both run in the quiesced span. After a rename the old id's in-memory state is forgotten and the color moves; after a delete the color entry is cleared.

### Agent payload

Lives in `src/routes/agents-payload.ts` (`agentPayload`). The record plus `dir` (local only), the legacy color and the `role` from its job description; color and role only where a vfs is wired.

### Smaller rules

`metrics.ts`: Prometheus exposition of the boot-span ledger for local debugging; pods push boot reports to the gateway and are never scraped. Without telemetry wired it answers 404.

`pod-activity.ts`: `/activity` is outside `/agents/` so it never counts itself.

`catalog.ts`: `/v1/catalog` is pi-ai's full baked model catalog, the same on every deployment with no profile gating, so it is public.

`agent-state-cleanup.ts` (`forgetAgentState`): everything in memory keyed by an agent id (approval receipts, fan-out budget, live-turn records) is dropped in one place when the id dies.

`agent-rest.ts` (`agentRest`): the per-agent rest is derived raw from the path, because the channel forwards bytes and a family matches several patterns.

## Routes: agent data and documents

### Mission attribution

Lives in `src/routes/activity-attribution*.ts`.

The acting human is stamped as a contributor on activity create and PATCH and on the mission a user turn drives, only under a gateway-injected acting identity. Off the gateway `activity.json` stays byte-identical, with no attribution keys. `created_by` never changes; editors are appended as contributors.

Mentions ride the turn body, so the route drains the body once, stamps `mentioned` (latest entry per person, each with the instant and author), and must hand the same buffer to the channel or the runtime receives an empty message. A failure to record mentions does not change the turn's outcome.

### Attribution stamping

Lives in `src/routes/activity-attribution.ts` (`stampTurnAttribution`). Runs only with a gateway-injected acting identity. The mission is matched by `session_key`, falling back to `activity-<id>`. Contributor and mention upserts return the same reference when nothing changed, so an unchanged mission skips the write, and both run in one load, save and emit pass. Failures are logged and never fail the turn.

### Typed `.houston` families over the workspace vfs

Lives in `src/routes/agent-data*.ts`.

Activity create is idempotent on id: a retry with the same id lands on the existing row. A different mission asking for a taken id is refused, because taking it over would reset the live card's status and erase whose work it is.

Routines: `timezone` is not a routine field (one account-wide zone); a client still sending it is ignored. Exactly one wake mechanism (schedule or trigger) is required; both or neither is a 400, and so is a malformed trigger binding, because `normalizeRoutines` would otherwise drop the row silently. Clearing the only wake without supplying the other is a 400 for the same reason. The routines editor pairs every cron save with `trigger: null`, so that combination must keep the schedule. Every write must keep rows that normalization would drop, so one bad row never purges others.

A webhook binding's `key_prefix` is display-only and round-trips; it is stamped after the key is minted.

An unknown provider on a routine is refused at write time, since every fired run would fail. The legacy alias `claude` is accepted, because migrated `routines.json` files still carry it (`routinePin` maps it at fire time without rewriting the file) and the editor round-trips stored values.

Routine `created_by` on a gateway-fronted pod is the gateway-verified acting `sub`, which the gateway can re-authorize at fire time, never the pod-local verifier id (that would 401 at fire time). Editing re-stamps to the current editor. With no acting header, a pod that knows its org owner records the owner, because the control-plane fire planner refuses authorless routines; a real acting header outranks the owner fallback. Off the gateway an acting header is client input and its claims are ignored.

A bad timezone preference is refused at the preference write, so it never blocks routine writes.

The raw agent-file route and the typed routes read the same file. A missing file reads as an empty string.

The `..` guard in the agent-file handler is a second check; the URL parser normalizes `..` segments away before a request is sent, so it is unreachable over HTTP.

Skill create on an existing name is a 409, never an overwrite.

### Document locks

Mutations of one agent's activity document and learnings document serialize under a per-document lock (`src/routes/agent-data*.ts`, `learning-write.ts`). Without it two concurrent creates load the same base and the last save drops the other's entry; this lost real board entries when a first message was submitted twice.

### Approval cards on the board

An activity row's `pending_interaction` is file content the agent can write, so the host re-renders approval cards from its own record (`src/routes/agent-data-activities*.ts`). Otherwise the board could show an agent-written sentence next to a live receipt for a different operation. A card claiming an id the host never issued is not shown as approvable. Each card carries structured args and English button copy that every decoder can rely on.

### Activity create

Lives in `src/routes/agent-data-activities.ts` (`CREATE_FIELDS`).

The app posts cards optimistically with a client id against a warming engine and re-posts when the first attempt is lost. A repeat matching every decided field is answered with the stored row (which may have moved on). Anything else with that id is refused. `status` is not compared, because the board owns it after create.

`origin_session_key` is stripped from client creates; only the missions sandbox route stamps it. `started_by` is stamped on create only and PATCH refuses it.

Attribution (`created_by` plus contributors) is stamped only under a gateway-verified actor.

Rows always leave through `hostOwnedApprovals` (`activity-approval-cards.ts`).

### Typed family boundary

Pinned by `src/routes/agent-data-boundary.test.ts` and `agent-data-docs.ts`. The family regex claims `<family>` and `<family>/<segment>` for every method. Item paths on whole-document families and any method on `routine_runs/x` are the family's 405; deeper paths are declined and forwarded to the engine. Forwarding an owned shape would wake a sleeping pod for a route its runtime lacks. Whole-document learnings writes take the same per-document lock as `save_learning`.

### Agent data caller facts

Lives in `src/routes/agent-data-caller.ts` (`agentDataCaller`, `trustedRoutineFloor`). Caller facts are read from what the host verified (`auth/acting.ts`, `auth/assistant-call.ts`), never the body. `createdBy` is the gateway-minted acting sub on a fronted pod (the id the gateway re-authorizes at fire time) or the local owner on desktop. `author` stamps activities only behind the gateway. `startedBy` marks a verified AI Manager or public API caller. The routine floor header is trusted only behind the gateway.

### Routines family routes

Lives in `src/routes/agent-data-routines.ts` (`handleRoutinesData`). POST and PATCH go through the shared merge-safe path; the verified actor is the new creator and is re-stamped on PATCH, so a fired routine acts as whoever last shaped it. Delete takes the same per-document lock so it cannot race a create or update.

### Typed families route shape

Lives in `src/routes/agent-data.ts` (`handleAgentData`). Activities, routines and runs, config and learnings are served off the workspace vfs with the same domain code in cloud and locally, before channel dispatch. List GETs return `{ items, diagnostics }`: agents write these files with file tools, so malformed entries are dropped and reported. One family route owns every pair, because the family regex owns both the ownership boundary and the 405; split routes would forward a `DELETE /config` to a runtime that has no such route. Shapes the family claims but does not serve (items of whole documents, single runs) get the family's 405 rather than waking the runtime. Family event lookup uses own keys only.

### Raw agent files (`agentfile/**`)

Lives in `src/routes/agent-file*.ts`.

A write fires the event the shared domain classifier picks, so a `CLAUDE.md` PUT reaches every client as `ContextChanged`.

On the local layout the runtime's data directory sits inside the agent root (`paths.ts`), so besides keeping every path inside the agent root, the route refuses top-level dot-directories other than the named documents the app keeps there. That keeps OAuth tokens, the served-providers manifest, `settings.json` and transcripts out of reach.

The board document is read through this route (`app/src/data/activity.ts`), so approval cards on mission rows are re-rendered from the host's record, as the typed activities route does.

### Host-owned config fields

The first-day fields of an agent's config are host-owned. Surfaces write the whole config after reading it, so both config write doors keep the stored first-day fields; a stale read must not restore or remove the start button.

### Agent file scope

Lives in `src/routes/agent-file-scope.ts` (`isServedDocument`, `isReadOnlyDocument`). On the local layout `.houston/runtime` sits inside the agent root, so the route admits the visible working tree by the Files tab's own rule (`turn/files-path.ts`) plus named internal documents (the board, settings and memory families and skill files). Anything else under a dot-directory is 403, including future additions. Routine documents are read-only here, because only the routine routes stamp `created_by` from the verified identity; the runtime's file tools refuse the same directory (`fs-guard.ts`).

### Raw agent file route internals

Lives in `src/routes/agent-file.ts`. The desktop reads activity, config and learnings as whole documents through this route (`readAgentJson`/`writeAgentJson`), so it backs the board. Event classification uses the shared domain `agentFileEventType`, so this route, the FS watcher and the web adapter's echo agree. A board document that is not JSON is served unchanged. The route is `*rest` because documents are addressed by relative path; unserved methods are its own 405. A missing file reads as an empty string, which `readAgentJson` treats as "use the fallback".

### Feedback

Lives in `src/routes/feedback.ts`. The web build's "Send feedback" posts the same payload the desktop files through Tauri, fronted by the host so the browser never holds the feedback service key. Errors surface as real statuses. An oversized body stays a 413. When the feedback service refuses every request from our side (its plan cap), the route answers a typed 503 the app reads as "deliver through the fallback".

### Heartbeat (`/v1/heartbeat`)

Lives in `src/routes/heartbeat.ts`. The AI Manager's morning briefing settings, last run and run-now, scoped to the caller's personal workspace. Behind the gateway it answers 501: the gateway owns the manager and does not serve a briefing, and a second daemon inside the pod would diverge. Without a local runner, run-now is 501. An unparseable body is a 400. Both paths are owned for every method so the 405 carries a classifiable code.

### Assistant learnings cap

Lives in `src/routes/learning-write.ts`. Only the personal assistant has a size cap, because its whole memory is injected into every system prompt; other agents recall on demand and stay uncapped. `ASSISTANT_LEARNINGS_FULL_MESSAGE` reaches the model verbatim, and the expected recovery is a whole-file rewrite of a merged list under the same lock. The assistant gets no `.houston` seeding, and its record is synthetic because `createAgent` refuses a leading dot.

`ASSISTANT_LEARNINGS_MAX_BYTES` caps only the assistant's document, measured on the exact bytes `saveLearnings` would write, because its whole memory is injected into every system prompt and an unbounded file would consume the context window. The full message is written as an instruction to the agent. The assistant is recognized by the last segment of its vfs key, the synthetic name discovery hands out.

### Learnings save (`/sandbox/learnings`)

Lives in `src/routes/learnings-sandbox.ts`.

The only writer that records provenance. On the gateway, `taught_by` comes from the acting identity stamped on the send that started the turn, or, for a fired routine with no human, the creator's `acting-user` sub (the same ladder as the integrations proxy). Off the gateway no identity key is written, because an inbound acting header is client input on the desktop.

The mission is matched as attribution does (`session_key === cid`, falling back to `activity-<id>`) and is stamped on every deployment.

The write merges under the per-document lock, so concurrent saves never drop each other.

Turn, chat and identity all come from the host's record of the turn (`routes/live-turn.ts`), never from the call: the runtime is the least-trusted process.

`CONVERSATION_ID_HEADER` is provenance only, never authorization. The write goes through `authorizeTurnWrite` (`routes/plan-gate.ts`), so a plan-mode turn writes nothing. `taught_by` is never the workspace owner, which on a managed pod is the placeholder `local-owner`. The mission lookup is best-effort: failing to resolve it never costs the learning. Saves emit `LearningsChanged` to the workspace owner, as the agent-data PUT does.

### Shared skills

Lives in `src/routes/shared-skills.ts`. Workspace-level CRUD with the workspace owner as the authz seam; both paths are owned for every method so the 405 is written behind it, and a stranger learns only that the workspace is not theirs. Promote places a full existing `SKILL.md` verbatim at an exact slug; a skill becomes shared only by that explicit act.

### Shared skills manifest

Lives in `src/routes/skills-manifest.ts`. Per-agent enablement of shared skills behind the ownership check; the family owns its path for every method so the unwired-vfs 503 comes before the 405.

### Skills routes

Lives in `src/routes/skills.ts`. Skills are `.agents/skills/<slug>/SKILL.md`, the folders pi loads into the prompt, served off the workspace vfs so edits reach the agent on its next turn (locally the folder is the agent's; in cloud it hydrates with the workspace). The family owns its paths for every method so the unwired-vfs 503 comes before the 405.

### Smaller rules

`activity-approval-cards.ts` (`hostOwnedApprovalCards`): question steps with a request id are re-rendered from the host's record; ids with no live record for this agent are stripped, leaving a plain question. The receipt is bound to its conversation when consumed.

`doc-lock.ts`: the document lock registry lives in `@houston/domain` because domain writers lock the same documents.

## Routes: turns and conversations

### Approval read route

Lives in `src/routes/agent-approval-read.ts`. One pending approval read on the authenticated shell surface, never the sandbox router. Both the versioned (app via gateway) and bare (desktop) spellings are live, as two routes over one handler.

### Approval substitution on conversation reads

Lives in `src/routes/agent-approval-stream.ts`. Every conversation read the runtime answers is re-serialized through `substituteApprovals`, buffered JSON and SSE alike, so approval cards show the host's record. `mayCarryQuestion` skips the parse when the body has neither the `"question"` token nor a `\u` escape, because parse plus clone plus serialize of a multi-MB transcript left the process hundreds of MB larger. Buffered bodies are rewritten whole at end; a stream cut mid-frame drops the remainder rather than flushing an uninspected frame. Non-JSON bodies pass through.

### Activity probes (`/agents/:id/activity`, `/activity`)

Lives in `src/routes/agents-activity*.ts` and `podActivityStatus`.

The per-agent probe is the gateway's idle-sleep probe and never falls through to the runtime. It is itself a counted `/agents/*` request, so a count of 1 means only the probe. The pod-level `/activity` is outside the counted prefix, so a count of 1 there is a real held request.

`busy` counts every held request (an event subscription, a streaming reply). Separate counters cover what the cloud waker reads alone: in-flight writes (the gateway's clock stops when the client leaves, so the count is all that holds the pod), pending provider sign-ins and pending assistant approvals (both live only in this process). None of those changes `busy`.

Engine pods are single-tenant, so the pod answer spans the whole store. A workspace with no channel wired, or a probe that throws, counts as busy.

### Busy inputs

Lives in `src/routes/agents-activity.ts` (`agentBusyInputs`, `podActivityStatus`).

Two overlapping per-agent probes see each other and both answer busy; that is conservative and clears by the next sweep.

Pending approvals and custom-integration browser sign-ins are reported apart from busy.

A POST to the per-agent activity path falls through to the runtime dispatch instead of 405.

The control plane's pre-roll probe treats anything but a literal `busy: false` as busy, so `false` must mean provably idle; an unwired, unconfigured or throwing agent counts busy.

### Runtime proxy members

Lives in `src/routes/agents-proxy-members.ts`. The list never decides a match; it is the published surface the SDK parity gate reads, and its test proves it against the runtime's transport tables. Each pair is annotated with the engines that serve it: the standing runtime (`channel/proxy.ts`) serves all, the Cloud Run dispatch (`turn/dispatch.ts`, `turn/dispatch-providers.ts`) a web-client subset. `health` is served ahead of the runtime's bearer wall. The browser live view is served to E2B turns by the Go gateway itself, so it is marked standing-only. `HOST_SERVED_RESTS` lists engine pairs the host answers from an earlier slot, so the drift test still sees one set.

Pinned by `src/routes/agents-proxy-members.test.ts`. The proxy members are implemented in the runtime package, so the list is checked against the runtime transport sources (`testing/runtime-transport-routes.ts`), with every file in the transport directory scanned. Captures compare by shape. Views published by `docs/view-capture.ts` to the managed doc store (served by the gateway while the pod sleeps) must each be a route someone declared.

### Approval seams on conversation requests

Lives in `src/routes/agents-turn-approvals.ts`. Deleting a conversation clears its pending approvals, since nothing could answer them and a stale id could be spent. History reads and the live stream go through approval substitution. The minting message is handled by the admission seam.

### Turn admission

Lives in `src/routes/agents-turn-message.ts` (`admitTurnMessage`). The first seam: retry identity and approval receipts are decided together because they read the same bytes and answer whether this is a new message, a retry the runtime already took, or a request that may not travel. Runs on every deployment.

### Turn record seams

Lives in `src/routes/agents-turn-record.ts` (`recordLiveTurn`, `applyModeSwitch`, `stampAttribution`).

The host records conversation, mode and acting identity from the request itself, since the runtime is the wrong witness. Mode is read only for the coordinator, the one agent whose operations the host performs.

A retry of a message the runtime already took records nothing; restarting the record would move the mode and depth guard onto a turn nobody sent.

The acting token, provider pair and plan limits are recorded only behind the gateway; off it they are client input.

A send with no mode uses the conversation's kept mode, as the runtime resolves it (`session/conversation-mode.ts`). An unreadable board is reported and reads as none, so the message still travels.

Mode switches during a turn (`POST …/mode`) are read on the way through so the host's plan gate never lags the runtime's.

Attribution is best-effort and never blocks the turn; mentions use the shared `parseMentions` guard. An unparseable body records no mentions and is left to the channel to answer: the turn channel returns a clean 400, the proxy channel relays the runtime's 500.

### Turn seams

Lives in `src/routes/agents-turn-seams.ts`. Each seam keys on a conversation path the runtime also serves, so none is a route; the request is forwarded either way and the seams run first. One function per concern; the body memo is all they share and list order is the required run order. The admission seam (`agents-turn-message.ts`) decides first; a refused message stops the remaining seams, since they would record a turn that never happens. The approval seam replaces the client response with a substituting stream.

### Runtime surface proxy

Lives in `src/routes/agents.ts`. `/agents/:agentId/<anything>` reaches the agent's engine through the workspace channel under one ownership check, run once by the dispatcher. Undeclared rests still reach the engine and get its 404. A definitive refusal (status 400 or above) releases the message's retry reservation; a thrown proxy failure is ambiguous, so the reservation stays until expiry.

### Live turn registry

Lives in `src/routes/live-turn.ts` (`liveTurns`).

The runtime names its conversation with `x-houston-conversation-id`, which is fine for its own bookkeeping but not for three decisions about the runtime: mission ancestry (an invented conversation would always read as "not a mission" and allow unbounded spawning), plan mode (a runtime that skipped its own check must not get the host to act), and whose name a sandbox write is made in. So the host records these itself where turns begin: the user's send (`routes/agents.ts`) and programmatic fires through each channel's `fireTurn` (`channel/proxy.ts`, `channel/turn.ts`).

Records are per conversation, and callers must name theirs; per-agent records would let a second chat relabel the first turn. The Mode pill updates only the conversation it names.

The record holds mode, the acting token (only where a trusted gateway fronted the start), the routine creator's sub for fires, the provider pin (a routine saved without a provider is pinned to the authoring chat's pair, since the runtime's last-used provider may be one the user never connected), and the gateway-stamped plan limits.

Starts and ends are counted per conversation, because the runtime queues a second send behind the first and the first end must not retire the record the second runs under.

`MAX_TURNS_PER_AGENT` (32) bounds records when end reports go missing; eviction drops the least recently started, which fails closed.

A process singleton because the writer and readers are different request stacks.

### Transcript shadow commands

Lives in `src/routes/transcripts-sandbox.ts`. Six commands plus their prefix: anything else under a conversation is a malformed command (400), which tells the runtime its shadow write was wrong rather than unauthenticated. The prefix pattern does not decode the conversation id, so an id that `decodeURIComponent` rejects still gets the 400, not the 401 wall.

A pre-cleanup runtime still sends `needsSessionReplay` on transcript shadow writes; it is ignored, never required.

### Turn body memo

Lives in `src/routes/turn-body.ts`. The request body is drained at most once and shared by every seam (`agents-turn-seams.ts`), so seam order does not matter; the approval receipts may replace it. `turnModeOf`, `turnPinOf` and `turnLimitsOf` read nothing from an unparseable body and leave the answer to the channel; an unreadable mode is treated as execute, since refusing an unparseable body would deny service. A model without a provider is not recorded as a pin. `parseTurnBody` parses once for both receipt readers on the hottest route; a non-object body is `null` and passes through.

### Turn message guard

Lives in `src/routes/turn-message-guard.ts`. A destructive operation is authorized by the person's own message, so receipts are recorded here, where no runtime can author one, on every deployment. The forwarded bytes have the `approvals` field and any caller-authored retry fingerprint removed. One parse serves both readers. An `ApprovalMessageRefusal` is answered with an actionable status; anything else (a corrupt receipt, a broken data root) stays a host failure.

### Smaller rules

`live-turn-pin.ts`: null or empty fields are absent, and a pin with no provider is no pin.

## Routes: missions

### Mission fan-out ledger

Lives in `src/routes/mission-fanout.ts`. The caller-side budget counts what one agent has out across every board, which no per-board cap can see. Slots for missions that left the board reconcile away.

`MAX_AGENT_STARTED_MISSIONS` (20) spans target boards and turns. A remote slot whose board cannot be read stays charged for a bounded hold after start (`REMOTE_HOLD_MS`). Transient remote read failures keep their slots until the failure ceiling. The ledger is a process singleton like `liveTurns`, and `forget` drops it when the agent id dies.

### Mission starter

Lives in `src/routes/mission-starter.ts`. Which AI started a mission is decided from verified facts. From an agent's turn: the coordinator is Houston, anyone else an employee, judged before retargeting. Over HTTP: the gateway-verified calling-agent marker (`trustedCallingAgent`) outranks the manager check; a person calling directly records no starter.

### Cross-agent and cross-pod missions

Lives in `src/routes/missions-*.ts`.

A caller may name another agent; the mission lands on that agent's board, is evented for it, and its first turn fires on its channel, exactly like a UI-created mission. The personal assistant keeps no board, so its work must live where the user sees it. The caller's own board gets no copy.

Target resolution fails closed: an unknown name, another user's agent and a hidden dot-agent all answer 404 and never leak a name the caller cannot see. The miss message lists the agents the caller can reach so the model corrects itself. When the agent list itself cannot be read, the answer says so rather than "no such agent".

The provider and model pin must reach the target's first turn, not only its row.

The depth guard reads the caller's board (where the parent chat lives); the running cap counts the target's board. The fan-out budget belongs to the caller: a caller-side ledger catches twenty starts spread over twenty agents, which no single board can see.

On a managed pod the assistant holds only its own agent, so starts go through the gateway to the target's pod. The target is named only in the address, never again in the body, so one move cannot fan out through the pod it reaches. The forwarded origin carries the depth, because the target pod cannot read the caller's board; depth past the ceiling never leaves the pod.

Pod side of a cross-pod start (`/agents/{id}/missions…`): the same start a local caller runs, plus the provenance the caller cannot write itself: the agent-started marker (what lets the runtime's turn-end report settle the card), and attribution from the gateway-verified acting identity. An unverified body cannot name the starter. The depth is a range check, so zero, negative, fractional or NaN depths are refused. The mode the mission was started in is the mode its chat keeps. Unknown mission paths never fall through to the runtime, which has no mission routes.

### Mission target directory

Lives in `src/routes/missions-directory.ts`. Candidates come from the host's own agents, or the gateway's list on a managed pod, in one shape (id, both qualifiers, bare name) for the single matcher in `agent-refs.ts`. A gateway failure is an error, never an empty directory that would tell the model the agent does not exist. With no gateway wiring nothing is fetched.

Desktop and self-host: regular agents see their own workspace (including their own board for self references), and the AI Manager spans the owner's workspaces. Managed cloud: local candidates plus the agents the gateway lists for the acting person (`GET /agents`). Local candidates come first, so a host that holds the agent keeps serving it locally.

### Mission status and settle

Lives in `src/routes/missions-manage.ts` (`handleMissionStatus`, `applyMissionStatus`, `handleMissionSettle`).

Delegated review may move a finished mission to `done` or `archived`. The guards (never a running mission, never the caller's own conversation, whose settle would contradict the move) live in `applyMissionStatus`, which runs on whichever side owns the board, so a cross-pod move applies the same guards. A move to `done` uses the user-move semantics of `applyActivityUpdate`: blocking interaction steps are stripped and clean-finish offers kept.

Board settle is normally client-side (the SDK folds the terminal frame and patches status). A mission started by an agent (`origin_session_key`) or the API (`started_by: "api"`) may have no client watching, so the runtime reports every turn end and the route changes status only for those, and only while running. Every successful reply stamps the card's message time regardless.

The settle report is the one message the runtime sends at the end of every turn on every deployment, so it is where the host ends its live-turn record; later sandbox writes are refused as out of turn.

The missions sandbox family is the runtime's only way to write the board: merge-safe writes under the per-document lock, the same events a UI write fires, and the facts the agent must not author (the agent-started marker, attribution) stamped by the host. The inbound cross-pod family is authorized by the gateway and needs no vault.

A pinned provider is refused for a mission only when the central credential store says it is not connected for the target (read with the raw acting token, since credentials are keyed by acting identity). With no central store, no pin is refused.

The calling turn's plan limits are handed to the child mission so its routine saves meet the same floor.

Model-call reports carried by settle go to telemetry on a managed pod and are dropped elsewhere.

### Mission provider pin

Lives in `src/routes/missions-provider.ts` (`resolveMissionProvider`, `resolveMissionModel`, `providerConnected`).

The runtime's `start_mission` enum is frozen per session while connects change, and only the host sees the target workspace, so the host does the live check. The happy path costs one credential read; only a miss pays for the status sweep the refusal lists.

Model ids are not validated: the host's per-provider `models` are a curated subset for the legacy cloud picker, and the runtime's catalog is the authority. Models are only resolved (display names to ids, through the runtime tool's table); unknown names pass through; with no provider the value is kept as written.

The refusal listing shows curated display names, adding a pi-known uncurated id only when the caller named it.

Connected answers true wherever the host is not the keeper: no central store, the OpenAI-compatible endpoint (config lives in the runtime), and Anthropic off the gateway (the runtime's login directory holds it). A store read failure warns and lets the pin through rather than refusing on a transient error.

### Mission reads

Lives in `src/routes/missions-read.ts`. The transcript read exists for cross-agent review; an agent reads its own missions from its runtime's in-process store (`tools/read-mission.ts`). Another agent's transcript is served from the file store under the same conversation key the routine reconciler reads (`schedule/reconcile.ts`), trying the convention id and then an explicit `session_key`. Remote agents answer for themselves through the forwarder. Reads return the last `DEFAULT_TAIL` (20) messages with a per-message clip. The board snapshot is newest first.

### Mission forwarding to another pod

Lives in `src/routes/missions-remote-forward.ts`. The pod's answer is relayed unchanged; a pod refusal keeps the sentence the model must act on; anything that is not the pod answering (including a non-JSON 200) surfaces as a reachability error. The forwarder sends no acting header: the gateway derives the acting user from the pod credential.

The gateway dispatches `/agents/{slug}/…` into the target's pod, waking it if needed, so these are the local board routes addressed elsewhere. Start answers the status the caller ended up sending, so the caller charges its fan-out budget only when the target took the mission. Pod refusals keep their status and sentence (cap, unknown id, no conversation yet); unreachable or non-JSON answers are a 502 that says so.

### Per-agent mission family

Lives in `src/routes/missions-remote-inbound.ts` (`handleAgentMissions`). Serves start, list, read and status on `/agents/{id}/missions…`. The gateway authorizes the caller (user, AI Manager or agent). A verified calling-agent header stamps `origin_agent` and lets that caller move its own missions. The family owns every path under `missions`, answering its own 404 and 405 with codes, since falling through would reach the runtime, which has no mission routes. The handler's `false` is a decline and must be returned, not swallowed.

### Inbound mission writes

Lives in `src/routes/missions-remote-writes.ts` (`statusInbound`, `startInbound`). Both follow the local rules through the shared modules. Both refuse a body naming an agent, since the route serves the agent in its address and a second hop would fan out. The "not the caller's own conversation" guard cannot fire here, because the calling chat lives in another pod. Plan limits are trusted only behind the gateway; only a gateway-verified header grants an agent move rights on the row.

### Cross-pod mission contract

Lives in `src/routes/missions-remote.ts`.

In managed cloud every agent is its own pod; a start on another agent goes `POST {gateway}/agents/{slug}/missions/start` and the target pod serves it with the same handlers as a local start. Each payload is parsed in one place so both entries accept exactly the same thing.

`MAX_MISSION_DEPTH` is 1: depth 1 is work a person asked for; depth 2 is refused so the board stays flat and spawn loops cannot run. Depth is carried, not looked up, because the parent chat may live in another pod. A missing origin or one past the first level is refused. The target stamps the origin's `session_key` as `origin_session_key`. The calling agent is absent for AI Manager starts.

`MISSION_DEPTH_ERROR` is read by the model, so it names no product as the actor.

A successful start echoes the provider and model as the target resolved them, so `start_mission` reports the truth when the target clamped or defaulted the pin.

### Missions sandbox context

Lives in `src/routes/missions-sandbox-context.ts` (`missionsContext`). Refusals are ordered deployment facts first (no agent data, no such agent), the caller's standing last. Writes require a running execute turn. The conversation is matched against the host's turn record because every mission decision that reads it is about the caller. The author comes from that record, never the loopback request's acting header.

### Missions sandbox routes (`/sandbox/missions/*`)

Lives in `src/routes/missions-sandbox.ts`.

`start` writes the board row first (origin-stamped, merge-safe, evented), then fires the child turn through the same channel a routine firing uses. A failed fire rolls the row back so no card sticks on Running. The provider pin reaches the turn, not only the row.

Depth 1: an agent-started mission cannot start missions of its own.

Provenance comes from the host's own record of the turn (`routes/live-turn.ts`), never from the runtime's conversation header. A conversation the host never started a turn in is refused outright, so the depth guard never reads an invented parent as a person's chat. Likewise a runtime-supplied acting header does not override the acting identity the gateway stamped on the send.

`status` moves only finished missions, never the calling conversation's own.

`settle` changes status only for agent-started missions still running; every successful reply stamps its card, and a user mission's settle still records timings.

A title that arrives after settle still applies, but a user rename wins over the fallback title.

The desktop coordinator is the dot-named `.assistant` agent and keeps no board of its own; every start it makes names an employee's board.

The acting-as header signature is not verified pod-side; the gateway is the trust boundary (`auth/acting.ts`).

### Mission start

Lives in `src/routes/missions-start-run.ts` (`startMission`).

`MAX_RUNNING_MISSIONS` (20) caps running agent-started cards on one board so a looping agent cannot flood one agent; the caller's cross-board budget is the fan-out ledger.

The write runs on the side that owns the board, so cap, row, event and turn are one decision wherever the call entered.

The pin resolves against the target's workspace credentials. The model resolves after the provider, since a spoken model name only means an id within its provider.

The row stores which agent asked, whether that was Houston, and the depth; across pods the row is the only place these survive, and the next start counts depth from it. The card's description is the prompt. The start mode is kept for later messages.

The child's integration calls act as the human driving the parent turn (gateway only), and the child runs under the parent's plan limits.

A failed fire removes the row under the document lock.

Lives in `src/routes/missions-start.ts` (`handleMissionStart`).

The agent-side twin of the app's `createMission`, firing through the same channel a routine uses (fire-and-forget 202; the runtime queues the child behind the workdir lock until the parent turn ends).

The parent conversation comes from the host's turn record; it is both the agent-started marker and the root of the depth chain.

Runtime file tools and Claude SDK writers refuse board writes, but a shell in a managed pod can still edit the board, so behind the gateway the gateway ledger and the delegation claim are the authority for one hop.

A parent that is itself a mission carries its start depth, so depth is counted rather than guessed, even when the grandparent is in another pod.

A malformed but successful remote response still consumes a fan-out slot, since without an id the caller cannot prove when it settles.

The starter role is read from the caller before the route is retargeted.

### Mission target resolution

Lives in `src/routes/missions-target.ts` (`resolveMissionRoute`). Absent `agent` means the caller's own board. Resolution is fail-closed and scoped to what the caller can reach (this host's agents, plus the gateway's list on a managed pod). No match answers with names that would match; several matches are refused with the qualified names that separate them. A remote candidate is driven with the same gateway credential that listed it. Refusals are values with codes.

### Mission title

Lives in `src/routes/missions-title.ts` (`handleMissionTitle`). The runtime titles a new mission's card after its first turn. Compare-and-set under the activity lock: the title lands only while the card still shows its creation fallback, so a user rename wins. It arrives after settle, so it is not gated on a live turn.

### Reachable agents

Lives in `src/routes/reachable-agents.ts`. The mission routes and the assistant dispatcher share reference matching (`agent-refs.ts`) but candidate sets differ: missions stay in the caller's workspace, the AI Manager spans the owner's workspaces. Dot-named agents are never candidates. A sandbox caller is known only by its workspace; a workspace that no longer exists yields no candidates, so references are refused rather than guessed. `<Workspace>/<Agent>` names one of two same-named agents.

### Smaller rules

`mission-fanout-remote-status.ts`: remote missions are read by id so one beyond the compact board still counts.

## Routes: routines and triggers

### Routine authoring pin

Lives in `src/routes/routine-creation-pin.ts` (`routineAuthoringPin`, `ROUTINE_DEFAULTS`). Resolved only for agent-made routines without a provider. Unattended runs use cheaper models so an expensive authoring chat does not set their cost. The Codex efforts follow the verified subscription efforts in `packages/runtime/src/ai/codex-offered.ts`, narrower than pi's catalog. Equidistant efforts choose the cheaper level.

### Routine fire delivery (`/agents/:agentId/routine-fires`)

Lives in `src/routes/routine-fires.ts`.

Always answers HTTP 200 with a result. `busy` and `failed` are terminal. `deduped` replays the recorded outcome of an instant already settled, with the original start time for `fired`. Every result is one older control planes already settle; extra fields are ignored there. Drain answers 503 (the shape server.ts uses), which the control plane retries.

Registered before the generic per-agent runtime dispatch, which has no such route. It runs in the user phase so the acting-as refusal answers a flat 404 before ownership is evaluated, never confirming whose agent it is.

Internal delivery uses the pod token and carries the minted creator token only in the body; any request carrying the acting-as header is refused. Pods do not hold the gateway HMAC key, so the route decodes the minted payload and requires its subject to equal `created_by` (or the manager's person on an AI Manager pod).

A redelivery while the first is pending waits. A failure about where the fire ran unburns the instant so the redelivery (to this host, a replacement pod or the agent's new id) fires it.

### Routine model check

Lives in `src/routes/routine-model.ts` (`checkedRoutineModel`). Both routine writers check models against the picker's catalog and the shared resolver, except for gateways and BYO endpoints that serve live ids beyond the baked catalog.

### Routine run routes

Lives in `src/routes/routine-runs.ts`.

Run-now and stop are matched before the generic per-agent dispatch (the runtime has no routine routes); a wrong method falls through to it.

Without storage or channel the route answers 503, so a run that cannot reach the runtime never reads as started.

Run-now fires through `ChannelRoutineFirer` exactly as the scheduler does. A busy routine is 409; other fire failures mark the run errored and answer 502. The run acts as the presser via the gateway-minted token; the creator's bare sub cannot be elevated by a pod, so without it the run used the team credential while the badge showed the presser's personal one as connected. Scheduled fires get the creator's token from the control plane.

Stop is always a 200 once the run is cancelled; the additive `abort_failed` says the live-turn abort failed.

### Routine schedules

Lives in `src/routes/routine-schedule.ts` (`checkedSchedule`). Bad schedules are refused at write, since a saved one silently never fires. Cron is validated in the single account-wide zone; there is no per-routine timezone.

### Routine update

Lives in `src/routes/routine-update.ts` (`updateRoutineChecked`). The exactly-one-wake invariant, the trigger-backend gate, the schedule and the provider pin are checked on the applied result, since `{trigger: null}` can clear the only wake. Converting a trigger routine to a schedule passes on a no-trigger deployment. Every update re-stamps `created_by` to the editor, whose plan then judges the fires, so even a prompt-only edit is floor-checked; a routine left disabled is exempt.

### Routine write gate

Lives in `src/routes/routine-write*.ts`.

One merge-safe read-modify-write path serves the agent-data route and the runtime `save_routine` tool, so two setup chats that each know only their own routine never delete each other's. It also holds the wake and trigger-backend gates.

The plan floor: a turn stamped with `limits.routineMinIntervalMinutes` cannot save a routine that fires more often, judged with the app editor's own rule so the agent and the person meet one line. No floor means no check (Plus, desktop). Cron gaps are measured as fired, so `*/16` (which fires :48 then :00, 12 minutes apart) fails a 15-minute floor while `@every 16m` passes. When an edit leaves an already-stored schedule under the floor, the refusal says the schedule has to move.

For the app's and AI Manager's routine routes the gateway stamps `x-houston-routine-floor` and strips any client copy; the host trusts it only behind the gateway and refuses with the same `400 plan_min_interval`.

Without a trigger backend (desktop, self-host, `triggersEnabled: false`) a trigger or webhook-bound routine can never wake, so its write is refused with the relay-ready message and its status is a hard error. Reads stay ungated, so legacy trigger routines still list.

Lives in `src/routes/routine-write.ts` (`createRoutineChecked`). The one blessed write path for both the agent-data route and `save_routine`; the runtime must never replace the file wholesale. Create gates: name and prompt present, exactly one wake, trigger backend available, valid schedule, plan floor, known provider pin. A routine created disabled is exempt from the floor, as on update. The clock is supplied by the caller so domain stays pure. A pooled turn carries the planner's timezone instead of workspace preferences.

Lives in `src/routes/routine-write-gates.ts`.

`NO_TRIGGER_BACKEND_WRITE_ERROR` is a plain sentence the agent can relay to a non-technical user.

`providerPinError` uses the same canonical mapping as the fire path (`routinePin`), so Rust-era aliases (`claude`, `codex`) in migrated files survive an edit. Explicit models are checked by `routine-model.ts` against the picker's catalog.

`planFloorRefusal` returns the protocol's `PlanMinIntervalRefusal` (pinned by `plan-floor-refusal-contract.test.ts`). `error` comes first and stays short because `save-routine.ts` keeps only the first 300 characters, and it names neither plan nor cron. Event triggers have no cadence to judge. The rule is the app editor's `scheduleFloorAllows`.

`@every` schedules: an even cadence is stored as the equivalent cron older readers know; an uneven one keeps the interval form; a malformed interval is refused.

### Routine authoring and fires

Lives in `src/routes/routines-sandbox.ts` and `routine-fires.ts`.

Chat-created routines inherit the authoring turn's provider, with cheaper defaults for unattended Anthropic and Codex runs. An explicit model or an update keeps the user's choice. Unpinned chats fall back to the agent config. The composer's `openai` display id is Codex on the wire.

Plan limits come only from the host's record of the authoring turn; a floor in the runtime's request is neither honored nor saved.

The fire instant is burned before the fire, so any later failure answers a terminal 200; a 5xx would make the control plane retry into a deduped "fired" for a routine that never ran. A redelivery replays the recorded outcome and names when the original attempt started, so the control plane can time it.

Failures about where the fire ran (the host draining or renaming, the runtime unreachable or refusing turns) unburn the instant and answer 503, so the control plane redelivers to the replacement.

With no errored run to show, the instant stays deliverable rather than settling as an invisible failure.

A redelivery while the first delivery is still firing waits instead of settling, since the first may still fail.

Only `console.error` reaches Sentry on the host: unexpected failures are reported there, a creator with nothing connected stays a warning. Typed refusals count toward the auto-pause.

Only the hand-pressed run row is marked manual. It ran as the presser, so it never moves the creator's snooze.

On managed cloud a routine stamped with the org owner fires as the owner.

Lives in `src/routes/routines-sandbox.ts`.

`save_routine` calls this merge-save instead of writing `routines.json`, because each setup chat knows only its own routine. A body with `id` updates in place; `id` is never a routine field.

`created_by` on a managed pod is the person the host recorded for the turn the call speaks in. A loopback sandbox call is not gateway-fronted, so its acting header is the runtime's word and is never read. No recorded turn falls back to the org owner (authorless routines are not fireable); off the gateway, the workspace owner.

The plan floor rides the recorded turn, never the request. Floor refusals carry their code and minutes.

A save emits on the same channel a UI or watcher write uses, scoped to the workspace owner.

### Routine run cancel

Lives in `src/routes/run-cancel*.ts`. The row goes terminal first ("Stopped by user"), then the live turn on the run's conversation is aborted through the channel. A repeat is a 409. An abort failure is reported to the client, since the runtime may still be running the turn.

### On-demand routine run (`/agents/:id/routines/:rid/run`)

Lives in `src/routes/run-routine*.ts`.

Uses the same firer and run record as the scheduler. A fire failure marks the run errored and answers 502. The prompt carries the run framing that keeps the agent from re-creating the routine.

A routine already running is a conflict. Concurrent presses race through the per-agent runs-file queue so exactly one fires and no run row is lost.

On a managed pod the presser's gateway-minted identity replaces the creator sub (never both), so the run uses the credential the routine screen's badge probed. On desktop and self-host the header is client input and the creator fallback stays.

### Trigger events (`/agents/:id/trigger-events`)

Lives in `src/routes/trigger-events*.ts`.

Results are discriminated: fired, no_routine, busy. A redelivery of the same event id acks without firing again. A busy routine releases the just-set dedup lock so a retry can fire. A refusal before the lock is set leaves the event re-deliverable. One event makes one errored row toward the auto-pause streak.

The event payload is framed in the prompt as data, never as instructions.

The control plane delivers over the bare host token, never through the user-facing gateway proxy, which stamps `x-houston-acting-as` on everything. That header on this route means a user request reached a pod-internal path, and the route refuses it even when the principal owns the agent.

The control plane mints the creator's token and sends it in the body; the firer passes it through so the turn uses the creator's credential scope. Self-host in-process delivery and older control planes send none.

On managed cloud the manager's routines always fire as the one person who reaches the manager.

Lives in `src/routes/trigger-events.ts`. The internal pod route (contract C9) for event batches from the control plane or the self-host process, on the host-token trust boundary. Results are always HTTP 200 with a discriminated result. User phase, so the acting-as refusal answers a flat 404 before ownership is checked. The acting-as refusal is defense in depth: the gateway also 404s this path. Firing on a proxied request would run a routine as its creator with a caller-written payload. The creator token rides in the body, optional for older control planes and self-host.

### Trigger status

Lives in `src/routes/trigger-status.ts`. This host is never a trigger backend: managed cloud's Go control plane answers this route at its edge. With `triggersEnabled === false` every trigger-bound routine is `error` with `NO_TRIGGER_BACKEND_DETAIL` (plain, relayable, with two ways out). With triggers enabled the host falls through rather than fabricate a status.

## Routes: AI Manager

### Assistant claim

Lives in `src/routes/assistant-claim.ts` (`assistantClaim`). Authenticating a sandbox token is not authorizing it; without the scope any desktop agent could post `deleteAgent`. Desktop and self-host: the claim must name the synthetic `.assistant`. Gateway-fronted: the pod holds one agent, and the host must also carry the gateway-stamped assistant user id, which the gateway puts only into the assistant's pod; a pool worker's Houston turn carries the same fact in its scope. Every branch fails closed.

### Assistant deployment routes behind the gateway

Lives in `assistantDeploymentRoute`. The hand-listed shapes must cover every visible generated operation exactly (method, path and query), or a new operation fails on every gateway-fronted deployment. Hidden credential operations are refused before dispatch. A method the pod never serves on a shape is declined rather than forwarded.

Lives in `src/routes/assistant-deployment-route.ts`. Applied after catalog authorization and approval: custom definitions live on the owning pod, and the gateway's root integrations surface is Composio, so the custom family is routed to the scoped per-agent mount, which uses the same user-global manager as the UI's card.

### Assistant dispatch

Lives in `src/routes/assistant-dispatch.ts` (`dispatchAssistantOperation`). The generated catalog carries each operation's route, so requests are built from it rather than a hand table. Catalog paths are direct-host paths; `assistant-deployment-route.ts` adapts the custom-integration family to the gateway's per-agent mount after authorization. Fail closed at every step. Arguments are type-checked again even though the runtime checks them, as an independent gate for direct callers.

### Assistant gateway forwarder

Lives in `src/routes/assistant-forward.ts`. `upstreamUrl` independently refuses a path that does not address its own route, even though `buildPath` checks first, because some callers build requests without the dispatcher.

Lives in `src/routes/assistant-forward.ts`.

The single place an operation leaves the pod. The verified acting identity is relayed so the gateway authorizes the person.

The in-process manager proof (`auth/assistant-call.ts`) is attached only when the gateway is this host itself (`loopback`). Fetch re-sends custom headers across redirects, so loopback calls use manual redirects and a 3xx is a refusal.

Outcomes: a 4xx is the app refusing (nothing happened); a 5xx or a lost or unreadable answer is unknown, since a timeout can follow completed work. A 2xx that is not JSON is not success; an empty body is relayed as no payload.

Lives in `src/routes/assistant-wiring.ts` (`resolveAssistantGateway`, `assistantOperationsServedHere`).

Resolved in one place for the host alone. No spawned runtime is told the URL or token; runtimes go through `/sandbox/assistant/call` with their own sandbox token.

The credential is the switch. A gateway-fronted pod uses the `HOUSTON_ASSISTANT_CP_URL` and `HOUSTON_ASSISTANT_TOKEN` pair the gateway stamps. An unfronted host is its own gateway (`self`: its loopback URL and per-boot bearer), marked loopback so it can carry the manager proof. An explicitly configured pair always wins. A pool worker's Houston turn uses its per-turn credential (`coordinatorScope`). With nothing, the dispatcher answers 501 naming the env.

Only a host that nothing fronts and that has no configured pair answers "what can this deployment do" from its own route table (`assistant/served-operations.ts`). Being fronted is carried as a fact from `local/host-base.ts`, not inferred from the env pair; a fronted pod whose variables are missing still serves one agent's routes, and reading those as the catalog would withdraw most operations from a managed assistant.

### Assistant grants

Lives in `src/routes/assistant-grant-gate.ts`. A grant approves a call for the person whose message carried it; the call acts as them, never as another actor the runtime names. After a confirmed call spends its receipt, the grant comes back only when the app refused the call, and only that call settles it.

### Assistant receipts and calls

Lives in `src/routes/assistant-operate.ts`.

`/pending` issues one exact-call receipt or card. A matching, constrained grant from the user's message returns a pre-approved receipt. Arguments are validated the same way performing them would be, so a card never describes a call that would be refused once approved.

`/call` performs a `confirm` operation only against an approved, unspent, unexpired receipt whose key matches the submitted arguments, in the same conversation and agent; otherwise `approval_required`. Receipts are keyed by resolved arguments. A receipt is recorded as spent before the operation leaves, or the operation does not leave.

The unserved check runs after `findVisibleOperation`, so a hidden operation reads as nonexistent.

### Assistant operation context and deps

Lives in `src/routes/assistant-operation-ctx.ts` and `assistant-sandbox-deps.ts`. One shared declaration so the gate and handlers do not import each other. `gatewayAgentId` is trusted pod identity, never a parameter. `unserved` is required, so a handler assembled without it cannot carry a silently open gate. The agent directory is lazy. `local/host.ts` assembles the deps at boot from the one wiring resolver. `unservedOperations` comes from the host's route table at boot; absent means nothing is withheld, the honest answer behind a real gateway. `persistApprovals` exists for pool workers, which live one turn and keep approvals in the agent's store, so a spent receipt is durable before the operation leaves (`turn/turn-coordinator.ts`); a host keeps them in memory.

### Assistant operation guards

Lives in `src/routes/assistant-operation-guards.ts`, `plan-gate.ts`, `assistant-operation-params.ts`, `assistant-approval-gate.ts`.

Guards run before arguments are touched, so card, receipt and request come from one set of arguments: unserved operations (`refusedUnserved`), undeclared arguments (`refusedUnknownParams`, run before identifier resolution, since an undeclared key is never sent but would be read into the card sentence and receipt key), and the plan and live-turn gate.

Plan gate (`authorizeTurnWrite`, `refusedOutsideExecuteTurn`): the same rule for catalogued operations, the mission board and memory. The mode comes from the host's turn record, never the request. No record for the named conversation fails closed. Reads are never gated, because a plan is built from what exists.

`resolvedParams` resolves identifiers first and answers 400 with what would have worked. A collection the deployment lacks is a final "no such thing here". `refusedDirectoryUnavailable` answers every unreadable live list the same way (nothing performed, Houston's failure, retry may work).

`approved` spends the receipt; `persisted` makes the spend durable before the operation leaves.

### Cloud-only catalog probes

Lives in `src/routes/assistant-parity-cloud-probes.ts`. Operations the local host does not serve are listed with a reason and asserted to miss the local route table; one that starts resolving locally means the surfaces drifted. Cloud-only families: spaces and members, shared context, billing and the personal plan, per-agent assignments, messaging channels, LinkedIn, identity-provider profile, send pre-warm, and routine webhooks (which arrive at the gateway that mints their key; a local host has no public address).

### Local catalog probes

Lives in `src/routes/assistant-parity-local-probes.ts`. A probe asserts the address resolves to a handler that authored its own answer, not that the call succeeds, so writes address things that do not exist or that the probes own. The Files block is ordered: create, rename, move and delete one folder.

### Parity probe tables

Lives in `src/routes/assistant-parity-probes.ts`. Every routable operation is in exactly one of three tables: `LOCAL_PROBES` (the host answers, itself or by relaying to the engine for `proxied` members), `CLOUD_ONLY_PROBES` (the miss is asserted), `WRITE_DRIVEN_OPERATIONS` (proven by effect). `serviceState` marks probes whose honest answer on a bare host is a specific 5xx because the capability is not wired. The Files probes act on a folder the probes own.

### Catalog to host parity

Pinned by `src/routes/assistant-parity.test.ts`.

Every routable catalog operation's address must resolve to a real handler on the host the app talks to; a miss is a generator bug. `/agents/:id/*` is a catch-all proxy to the runtime, so a stand-in runtime answers a sentinel status: a sentinel for a host-served route means the address fell through; for a member of the runtime-proxy family (`routes/agents-proxy-members.ts`) it is the pass.

The stand-in runtime must answer `GET /health` with 200, since that is the launcher's awake contract (`launcher/process-probes.ts`). The probe agent is woken up front because read-only probe routes race the wake against a 1.5-second deadline (`channel/probe-wake.ts`).

Operations are resolved by name, not by visibility, so re-tagging an operation hidden never retires the address check. Every visible operation must appear in exactly one probe table (local, cloud-only with a reason, or write-driven), and stale probes for renamed operations fail.

The SDK write operations run last and end to end, since only a write proves the method, body mapping and id round trip. A rename moves a local agent's id (its path), and the agent's color must follow it; a deleted id must not leave its color for the next agent at that path.

### Assistant path segments

Lives in `src/routes/assistant-path-segments.ts` (`safeSegment`, `addressSegments`). Values come from a model and are pasted into a URL performed with the gateway credential. The check runs on the fully decoded value, because `"..%2F.."` survives encoding as `"..%252F.."` and a route that decodes its capture (`routes/skills.ts`) would land on `"../.."`. Decoding stops at invalid percent-encoding (a literal `%` in "50% off"), since nothing downstream can decode further. Refused: empty, `.`, `..`, separators, control characters (NUL truncates paths in some readers). A `path` parameter's separators survive and each part is checked. An agent reference in the `/agents/{...}` position may be `Workspace/Agent`; its `/` is escaped into one segment, and each half must still be a real name.

### Protected chat guard against the real catalog

Lives in `src/routes/assistant-protected-chat.ts`. Ownership comes from three places: the calling turn's conversation, the addresses minted for records (`@houston/domain` conversation-keys) and the board, which alone records non-conventional mission chats (`welcome-` chats, keys patched by `app/src/lib/warming-sends.ts`). An unreadable board refuses, as identifier resolution does. Only operations whose path ends in the chat id (acting on its existence or name) are guarded; cancel acts inside the chat and stays allowed. The refusal `PROTECTED_CONVERSATION` is named on the runtime side too (`session/tools/assistant-result.ts`) so the model hears a final state. Reads are never guarded.

Pinned by `src/routes/assistant-protected-chat.test.ts`. The guard reads declarations (a parameter with `source: "conversations.list"` at the end of the path) rather than operation names, so the test checks the generated catalog still spells both halves and still declares the agent parameter the board lookup needs. A board read failure is reported and refused, never left hanging.

### Approval receipts from user messages

Pinned by `src/routes/assistant-receipt-path.test.ts`. Only the user's own message turns a host-issued request id into a receipt, written on the send path (`routes/agents.ts`), because a runtime cannot author a user message. The marker is stripped before the body reaches the runtime.

### Assistant request building

Lives in `src/routes/assistant-request-parts.ts` (`buildPath`, `buildBody`) and `assistant-forward.ts` (`upstreamUrl`).

Path parameters come from a language model, and `new URL(...)` resolves `.` and `..` segments (including `%2e%2e`) before anything sees them, so a dot-segment parameter would reach a different route from the one the call names, including routes the manager is not served. `encodeURIComponent("..")` is still `..`, so percent-encoding does not keep the path in place. `buildPath` checks that the finished path resolves to itself, and `upstreamUrl` asserts the same where the URL is made.

A `{param}` placeholder the catalog did not declare means generator and dispatcher disagree; no address is built.

Parameter reads use own properties only (a param named `constructor` is absent), and dotted `bodyFields` reads treat non-objects as absent.

Query and path values must be scalars; objects and arrays are a 400, never `[object Object]` in a URL. Omitted optional query parameters drop their key, matching the client's filter.

### Assistant operation dispatcher (`/sandbox/assistant`)

Lives in `src/routes/assistant-sandbox.ts`, pinned by `assistant-sandbox.test.ts`.

Fail closed. Only a valid sandbox token gets in. An operation the catalog does not publish as callable is refused, never forwarded. A body with no operation lands in the same branch as an unknown name, never in a lookup that could resolve an inherited property.

A hidden operation is refused exactly like an unknown one, including when it is also listed as unserved. Answering "unavailable here" would confirm that it exists.

The credential is the switch: with no gateway configured the route answers 501 with a named code. A configured gateway with no packaged catalog is a broken image and answers 503, never a forwarded guess.

Upstream calls carry the gateway's credential plus the caller's verified acting identity, never the runtime's sandbox token.

The claim is authorization, not only authentication. Every agent on a desktop holds a valid sandbox token, so the route checks that the token belongs to the assistant agent. On a gateway-fronted pod the gateway hands one pod's credential to one agent, so that agent is the assistant.

The confirmation lock lives in the host, not the runtime. A `confirm` operation needs a receipt from the `/pending` step. The receipt is bound to the exact request bytes, not to the card wording, and is spent once.

An unattended turn (a routine) has nobody to ask, so `/pending` refuses a call with no conversation.

Identifiers are never guessed. Every agent-naming parameter is resolved against the agents this caller can address before a request is built; a miss answers with the names that would have matched. Dot-named agents (Houston's own) are never offered or matched. The approval raised for a spoken name is spent by the call that runs on the resolved id, so card and receipt describe the same bytes.

Plan mode is the host's to enforce. A write is refused while the host's own record of the turn (`routes/live-turn.ts`) says plan, regardless of what the runtime sends.

An argument the catalog does not declare is refused before dispatch, so nothing the call does not carry can reach the confirmation card.

A write with no live turn behind it is refused, matching the missions routes' `not_in_turn`.

Operations this deployment cannot perform (the unserved set from `local/host-base.ts`) are refused by name before any request is built. Left to the address, the 404 would be relayed as `gateway_error`, which reads as an outage to the model and the person.

A collection the deployment does not have (members on a local host) is a refusal the model can act on, not an empty list (`assistant/entity-directory-local.ts`).

A non-JSON 2xx from upstream becomes a 502: something other than the gateway answered.

Body assembly mirrors the client: a body built from an inline object literal is assembled from its named parameters, and an omitted optional field is left out (as `JSON.stringify` drops `undefined`), never sent as null. A `path`-encoded parameter keeps its separators and escapes each segment on its own; ids are escaped as `HoustonClient.seg` escapes them.

Protected chats (`assistant-protected-chat.ts`): the assistant cannot rename or delete the chat its turn runs in, nor a chat a mission card or routine owns. Ownership comes from the board, because live missions can sit at addresses other than the `activity-<id>` convention. Chat ids compare case-insensitively, because macOS and Windows resolve `ACTIVITY-m1.json` to the same file. The guard protects the chat's address only; cancelling a mission still works.

Lives in `src/routes/assistant-sandbox.ts`.

The runtime is the least-trusted part of the system, so it never holds the credential that acts on a user's account and never decides that an approval happened. It carries only its sandbox token; this route resolves the operation against the generated catalog (`assistant/catalog.ts`), enforces receipts (`assistant-operate.ts`, `assistant/approvals.ts`), holds the gateway token and relays the verified acting identity.

The decoded claim is scoped to the personal assistant (`assistant-claim.ts`).

Both paths are owned for every method so the wrong-method 405 carries a `code` the runtime tool classifies, instead of the bearer wall's 401.

The catalog is embedded at build time; a configured gateway with no catalog means the embedded document failed its envelope guard, which the boot log names.

The agent directory is listed lazily, only when an operation names an agent.

### Assistant discovery (`/v1/assistant`)

Lives in `src/routes/assistant.ts`. The assistant is a hidden agent reached through the ordinary per-agent session routes; discovery serves only its address and conversation. On desktop and self-host it is the dot-named `.assistant` in the personal workspace: dot names are hidden from listing (`store/local.ts`) and refused by `validateAgentName`, so no user action can create, rename onto or show it. It gets no `.houston` seeding. `ASSISTANT_CONVERSATION_ID` is one stable conversation per user. Behind the gateway, discovery belongs to the gateway (which knows which pod holds the assistant), so the host answers 501. A deployment without an on-disk tree also answers 501 with its own code; it used to be 503, which the transport retried for ten seconds. Directory creation is idempotent (`liveAgentDirFor`'s dot-segment carve-out), so a retry converges. The path is owned for every method for a classifiable 405.

### Sandbox scope of the coordinator

Pinned by `src/routes/sandbox-scope.test.ts`. A valid sandbox token is every runtime's key to `/sandbox/*`, so every mounted sandbox family has an explicit row saying whether the assistant reaches it; a new family without a decision fails. On a managed pod the coordinator is identified by the gateway-stamped `HOUSTON_ASSISTANT_USER_ID`, not its name.

Lives in `src/routes/sandbox-scope.ts` (`refuseOutOfCoordinatorScope`). Every runtime's sandbox token reaches `/sandbox/*`, which is right for ordinary agents but not for the coordinator: instructions arriving in its chat would reach whatever its token reaches, including routine writes and app execution it has no tool for and which the catalog would require a receipt for. So its reach is one allowlist keyed on the claim (`routes/assistant-claim.ts`): assistant call and pending, the missions board, its own learnings save, transcript recall, its own credential serve and revocation report (without which it could not answer at all), and read-only provider usage. Everything else is 403 `coordinator_scope`. Non-coordinator and unauthenticated calls pass through to their routes.

Lives in `src/assistant/coordinator-scope.ts` (`runAsCoordinator`, `coordinatorScope`, `gatewayAgentSlug`). A managed assistant pod learns it is Houston from its environment (`HOUSTON_ASSISTANT_USER_ID`, `HOUSTON_AGENT_SLUG`, the credential pair). A pool worker serves Houston's and ordinary agents' turns in one process, so the identity cannot be process-wide: Houston's turn runs the host's handlers inside an async scope carrying owner, slug and per-turn credential, visible only to those calls. Readers prefer the scope and fall back to the environment. The scoped credential is never marked as loopback.

## Routes: provider credentials and accounts

### Owned workspace check

Lives in `src/routes/account-access.ts` (`ownedWorkspace`). Ownership is checked before the vfs, so a stranger learns nothing about wiring, and a missing workspace reads 404, not 403. No vfs makes preference routes 503.

### Sidebar layout

Lives in `src/routes/account-sidebar.ts` and `sidebar-layout.ts`. Per-workspace order and grouping persist as one `sidebar_layout` preference so they survive agent churn; owner-only. Writes are validated strictly (400 on a bad body). A corrupt stored document keeps every group it still names rather than reading empty, because the next whole-document write would store the emptiness.

### Account routes

Lives in `src/routes/account.ts`. Personal tier means one workspace per user, so workspaces and preferences are scoped to the caller's own workspace with no id in the path. The wire shape never exposes slug or runtime. Cloud auto-provisions the personal workspace on first list; local lists every workspace on disk. Only locale is mutable in cloud. Create-only preferences (`onlyIfAbsent`) hold whatever value is present, null included, and check and write share the preferences document lock.

### Manual credential connects

Lives in `src/routes/agents-credentials-keys.ts`. An API key is stored centrally for the workspace and pushed into the standing runtime; a verification failure is a 502 with the runtime's typed reason (bad key, restricted key, outage). The hosted Claude subscription push carries the credential `claude auth login` minted on the desktop, so a hosted pod's SDK can authenticate and self-refresh. An invalid JSON body parses to `{}` and is rejected as a 400.

### Capture and forget

Lives in `src/routes/agents-credentials.ts`. Declared ahead of the runtime dispatch, which has no such routes. Capture persists the just-connected provider's credential (by id, not the first OAuth entry in `auth.json`) for the whole workspace. Forget drops the workspace credential; clearing only the runtime's `auth.json` let the next turn re-hydrate it from the central store.

### Hosted Claude subscription push (`/agents/:id/credential/claude-oauth`)

Lives in `src/routes/claude-oauth*.ts`.

Owner-only, strictly validated, never logs the token. It writes both the central store and the standing runtime; a runtime reject surfaces as a failure (the central copy stays for durability) so the desktop can retry or fall back to paste.

On a gateway-fronted pod every dispatch carries an acting identity, and the runtime refuses to materialize an attributed credential into the pod-shared login directory. So for an attributed push the central put is the whole connect (served access-only per turn) and the runtime is never called. Treating the runtime refusal as a failure caused a reconnect loop where the desktop saw a 502 for a connect that had succeeded.

`?if_absent=1` makes the push fill-only. The desktop reconcile re-pushes a cached snapshot whose refresh token the gateway may have rotated; overwriting the live credential with it revokes the whole token family.

An absent row is not proof it is fillable: after a provider revocation the fill is refused (revocation tombstones), because old clients loop the fill every 15 to 30 seconds and would resurrect the dead family. A real sign-in is never blocked and lifts the tombstone for the user (keyed by `sub`, not token) on both the personal and shared key. The clear happens before the attributed early return, or every cloud reconnect would strand a tombstone.

### Sandbox credential serve (`/sandbox/credential`)

Lives in `src/routes/credential*.ts`.

A credential that cannot be refreshed centrally (refresh rejected, or no refresh config) is served best-effort instead of failing every turn; a 500 would make the runtime's multi-provider serve loop fail repeatedly on an unused credential. API-key credentials are served as-is and never refreshed or judged stale.

Anthropic is served only on a gateway-fronted host. A desktop or self-host store can hold a pushed-credential durability marker, and serving it would shadow the working local keychain credential inside the Claude Agent SDK, where `CLAUDE_CODE_OAUTH_TOKEN` outranks the config directory. A stale Anthropic token is never served best-effort for the same reason; the marked 404 lets the runtime use the materialized file. Anthropic has no TypeScript refresh config (the Go gateway refreshes upstream), so the stale guard must catch it.

Two 404 markers: `x-houston-not-connected` is the authoritative disconnect (the runtime drops served credentials only on marked 404s, never a bare one) and `x-houston-not-served-here` means this deployment never serves the provider, so the runtime's ghost cleanup leaves the browser login's `.credentials.json` alone.

Stale margins: the serve margin must stay above pi's 5-minute refresh floor, since a served entry has an empty refresh token and a token served inside that window is born expiring. Only a token past the default stale margin is refused; a longer margin only triggers a refresh attempt. Refusing a still-live token would be an authoritative disconnect and flap Anthropic org-wide while gateways roll the 10-minute serve skew. The runtime's empty-refresh guard keeps pi from posting empty refreshes for short-lived tokens.

A refresh rejected with a terminal error (refresh token invalidated, including OpenAI's current wording) removes the dead row so the next serve answers "not connected" without another doomed exchange. The removal is compare-and-delete on the token digest and scoped to the acting identity and row kind: a reconnect or a sibling host's rotation must survive, and one member's dead subscription must not disconnect the team's.

A transient 5xx keeps the row and is not retried, because the endpoint may already have rotated the refresh token.

A disconnect landing between the route's read and the refresher's critical section wins; the route reports "not connected" instead of recreating the row.

The refresher is process-wide and single-flight: one runtime per agent serves per turn and per providers poll, and openai-codex rotates its refresh token on use, so concurrent exchanges would invalidate each other.

A `fresh=1` serve invalidates the remote store's 15-second negative cache for the acting identity first, so the retry after a reconnect sees the new credential.

The runtime-credential healer is wired with `localOriginOnly` and `ifAbsent`, so a serve-written projection is never resurrected as a pasted key.

A gateway `provider_account_blocked` answer reaches the runtime as the same typed answer: neither a marked 404 (the credential is intact) nor a 500.

### Runtime credential healer

Lives in `src/routes/credential-healer.ts`.

Heals are single-flight per (workspace, provider, acting identity). Sharing a slot across members would answer one member with another's result and capture one member's credential onto another's row.

Each key has its own cooldown (`HEAL_COOLDOWN_MS`). A refusal that did not attempt a heal (a revocation tombstone, a draining host) does not spend the cooldown.

No heal while the provider's revocation tombstone stands, since the serve miss exists because the provider revoked that credential family.

A launcher closed for drain, a rename latch or a bare `fetch failed` while draining is expected traffic: the route answers the waking shape and nothing reaches `console.error` (on a managed pod every `console.error` is a Sentry event). A runtime respawned under a new id heals on its next miss.

Failures are grouped per runtime into incidents: one error per incident while failures continue within the gap, a new incident after a quiet gap.

Lives in `src/routes/credential-healer.ts` (`CredentialServeHealer`).

One heal attempt per (workspace, acting scope, provider) every `HEAL_COOLDOWN_MS` (5 minutes).

While the host drains, attempts reject with `LauncherClosedError` before starting (no log, no cooldown). A heal reads the runtime's live credential, and a draining host is killing that runtime; the runtime's serve sync probes every provider at once mid-drain, so without this every roll logged one Sentry error per provider per pod. The rejection becomes 503 with `Retry-After`, which the runtime reads as transient and keeps its copy, rather than a marked 404 verdict. A rename's `AgentRenamingError` takes the same path with no cooldown spent.

Network failures (undici's bare `fetch failed`, or the export `AbortSignal.timeout`) mean the runtime is unreachable, one fact per runtime. They are grouped into incidents per (runtime, cause) with `NETWORK_INCIDENT_GAP_MS` equal to the cooldown: the first is a loud error naming the cause (undici hides `ECONNREFUSED` and friends behind `fetch failed`), the rest are warnings, and every failure extends the incident.

### Serve-time refresh

Lives in `src/routes/credential-refresh.ts` (`refreshedForServe`, `SERVE_VALIDITY_SKEW_MS`).

`SERVE_VALIDITY_SKEW_MS` is 6 minutes: pi refreshes any stored OAuth entry within 5 minutes of expiry (`DEFAULT_OAUTH_MINIMUM_VALIDITY_MS` in pi-ai), and a served entry has an empty refresh token, so a token served with less than that is born inside pi's refresh window. Six is pi's five plus a minute. It is passed explicitly; `isExpiring`'s 2-minute default serves other callers. The single-flight re-check uses the same margin.

A provider-blocked account (Copilot billing locked) with a valid token serves the token's remaining life; once dead, the typed block answer is returned so nothing reads it as a sign-out.

A disconnect while the refresh was queued answers "not connected" with nothing to delete.

A rejected refresh token goes through `credentials/disconnect.ts` (compare-and-delete); if superseded, the new credential is served through every remaining check.

No refresh path or a transient failure serves the existing token best-effort, logged; an expired one surfaces as a clear auth error on the real call.

### Revoked-token report

Lives in `src/routes/credential-revoked*.ts`. The report is a delete trigger for a credential, so it passes the token digest down (the delete is conditional) and, for a personal credential, the acting identity; the gateway keys personal rows by (org, user, provider) and refuses without it. `removed: false` (superseded) is still a 200. A gateway failure during the delete answers a retriable status so the runtime retries quietly on its next sync. The expected disconnect pipeline is not an error-level log.

Lives in `src/routes/credential-revoked.ts`. A provider-revoked token looks present and unexpired on the serve path, so the store kept handing it out and every turn failed until expiry; the runtime's failed turn is the only witness. The report names the token by digest and the store deletes only while it is still the stored one, so a report from a turn that began before a reconnect never deletes the new credential. A report without a digest is refused, because it could only be an unconditional delete. A team report carries no acting identity and stays valid. A confirmed removal logs info and leaves a revocation tombstone (`revocation-tombstones.ts`); a second confirmed removal inside the tombstone window means something refilled a revoked credential and logs at error level.

### Acting identity on credential routes

The four credential routes read `x-houston-acting-as` only on a gateway-fronted host. Off the gateway the header is client-supplied input; honoring it would file the credential under a per-user `auth-users/<hash>.json` scope instead of the shared `auth.json`, and every agent would read as disconnected. The dispatch side of the same rule is in `channel/proxy-acting*`.

Lives in `src/routes/credential.ts`.

`notConnected` is the only way the route writes a 404, so the `x-houston-not-connected` marker is never forgotten; a bare 404 (old host, wrong URL) must never read as a logout.

The runtime serves a fresh token from the workspace's central credential, authenticated by the sandbox HMAC token, and refreshed here so no runtime holds or rotates the refresh token. Only the access token leaves the process (plus `accountId`, which the ChatGPT backend needs), so a sandbox credential that ends up elsewhere is worth minutes. `kind` tells the runtime whether to write an api_key or oauth entry. `enterpriseUrl` (Copilot Enterprise domain) sets the API base URL.

Anthropic serves only behind the gateway, the single refresher. Refreshing on a desktop would make this host a second rotator of a token family the pod owns.

The acting header selects whose credential; absent means the shared scope.

`fresh=1` is sent only while a turn's auth-failure mark is active, at most once per sync; without invalidating the 15-second remote cache, a reconnect would be undone by the cached miss and the reconnect card would loop.

Self-heal pushes the runtime's live credential as the acting member, so a warm pod never files one member's credential into another's row.

### OpenAI-compatible endpoint connect

Lives in `src/routes/openai-compatible*.ts` and `custom-endpoint-validation.ts`.

The route is the hard cloud gate: it refuses unless the `openaiCompatible` capability is on, before reaching the channel, because a cloud runtime cannot reach the user's localhost.

On a managed pod the base URL is validated against the pod's egress: public HTTPS on port 443 only. Refusals carry a typed code the client keys translated copy on; for localhost the private-host code is the one reported.

After the runtime save the route calls the store-sync flush once before answering, because the gateway's bridge binding check reads the endpoint file from object storage as soon as the desktop probes the model. The route always calls the hook; only managed pods wire one.

Channel failures answer 502.

Lives in `src/routes/agents-provider.ts`. The scheme is validated at the boundary, mirroring the runtime, so a bad URL is a 400 and non-HTTP schemes never reach egress. Managed pods egress only to public TCP 443 (the NetworkPolicy drops private, loopback, link-local and metadata addresses), so unreachable endpoints are refused at save with a `code` for translated copy. The acting identity selects whose credential scope the runtime writes. The org-visible shared copy is published or retracted after the save.

### Plan floor refusal contract

Pinned by `src/routes/plan-floor-refusal-contract.test.ts`. Every `400 plan_min_interval` body must parse with the client's parser (re-exported by `@houston/wire-types`, used by the SDK's `planMinIntervalRefusal` and the app's toast), round-tripped through JSON.

### Copilot quota probe

Lives in `src/routes/provider-usage*.ts`. GitHub's quota endpoint needs the long-lived GitHub OAuth token, which only the central store holds (the runtime's `auth.json` is access-only). The route relays the payload without the token, answers the marked 404 when never connected, and maps GitHub's auth rejection to 401.

Lives in `src/routes/provider-usage.ts`. The probe hits `GET api.<host>/copilot_internal/user` with the central GitHub token, using headers the runtime's `ai/usage/copilot.ts` mirrors, and relays plan, percentages and reset date. Only Copilot needs the central token. The acting header selects whose account. Answers: 200 payload, 401 when GitHub rejects the token, marked 404 when never connected, 502 otherwise.

### Setup runtime (`/setup-runtime/*`)

Lives in `src/routes/setup-runtime*.ts`.

First-run onboarding connects the user's AI before any agent exists, so the host runs the login in a hidden setup runtime: a synthetic dot-named agent the FS store never lists, scoped to the personal workspace so the captured credential lands where every real agent's serve reads it.

A strict allowlist: no chat or export surface (export would hand a refresh token to a client). Cancel is allowed because the reconnect card always runs cancel then launch.

Forget clears the central credential on the personal workspace and the runtime's copy through the allowlisted logout.

The desktop's browser login posts here when no agent exists yet. A malformed envelope is a clean 400 so the desktop falls back to paste; a channel refusal is a 502 with the reason.

Lives in `src/routes/setup-runtime-credentials.ts`. `SETUP_CREDENTIAL_RESTS` is folded into the setup-runtime family so the pre-agent surface is one enumeration, never a prefix. These are agentless mirrors of `/agents/:id/credential/*`, handled host-side, landing on the personal workspace: capture (scrubs the refresh token), forget (the only way to forget a central credential in a space with no agent), api-key (stored centrally and pushed so status reads connected; verification failures are a 502 with the typed reason), and claude-oauth (validated envelope; `if_absent` fill-only; a revoked-refill block answers 409, since it was refused on purpose).

Lives in `src/routes/setup-runtime.ts`. Provider OAuth runs inside a pi runtime, but onboarding connects the user's AI before the first agent exists (the order the Rust engine's global login had). The synthetic agent `.setup/connect` lives under a dot-directory (`listDirs` skips dot names). `SETUP_RUNTIME_RESTS` enumerates every forwarded sub-path: login cancel is included because the runtime keeps one login slot per provider and the reconnect card always cancels then launches; logout clears the runtime's own copy after `credential/forget`. The hosted gateway mirrors this allowlist in front of the org's setup pod, so a route added here is dead on cloud until it is allowed there. The family owns the whole subtree: unserved sub-paths are its 404 and an unwired runtime is its 503 for every sub-path. The sub-path is forwarded as received.

Pinned by `src/routes/setup-runtime-surface.test.ts`. The hosted gateway mirrors the allowlist (`internal/edge/setupruntime/routes.go` in the cloud repo), so the declared family must equal the list, and unlisted sub-paths (chat, settings, `auth/export`) and undeclared methods on listed paths reach no pattern.

## Routes: integrations

### Custom integrations routes

Lives in `src/routes/custom-integrations*.ts`.

Two user forms: top-level `/v1/integrations/custom/*` and per-agent `/agents/:id/integrations/custom/*`. The per-agent form is the one the hosted gateway proxies to a pod (the gateway's own `/v1/integrations` subtree is Composio-only), so the in-chat credential card uses it on both deployments.

A malformed percent-escape in the slug is a non-match that falls through to the generic provider handler, never a 500.

A slug with no definition (invented by the agent, or whose add failed) answers a clean `not_found`, so no card is queued whose every save would fail.

### Custom integration add input

Lives in `src/routes/custom-integrations-input.ts`. One validator for the agent's sandbox add and the user add route; shape errors are 400s whose message the agent relays to correct itself. Static MCP headers refuse `Authorization` and cookies, so a secret only travels through the credential save into the vault, never into the definition file. A non-HTTP website is dropped (the icon is cosmetic). An inline spec (written by the agent from API docs when no OpenAPI URL exists) is never fetched.

### Custom integration user core

Lives in `src/routes/custom-integrations-serve.ts` (`serveCustomTarget`). All mounts land here so the answer never depends on which one the client called. The manual add form uses the same `parseAddInput` validator as the agent's sandbox add. OAuth start mints the authorize URL; the redirect lands on the public callback route (`custom-integrations-oauth.ts`), which completes server-side.

### Custom integrations user surfaces

Lives in `src/routes/custom-integrations-user.ts`. Credential values cross only in the HTTPS body to the secret store, never through the chat transcript. Definitions and secrets are user-global on a single-user host; the agent id in the per-agent form authorizes and routes (it is how the gateway finds the pod) but does not scope data. The `/v1` mount claims its subtree for every method: an unwired manager answers 404 and a target the grammar rejects is declined so the generic provider family still answers `custom/connections`. The per-agent form declines when unwired or unknown, because the family behind it is the agent's engine. The op chain (`op/handler-chain.ts`) reuses the per-agent form.

### Custom integrations sandbox routes

Lives in `src/routes/custom-integrations.ts`.

`bodyOr400`: a malformed or non-object body answers 400, never 500.

`CustomTarget` is the route grammar shared by every user mount; anything else (`custom/connections`, a malformed escape) returns null and falls through.

`status` is the pre-flight behind `request_credential`: the runtime refuses to queue a key card for a slug with no definition.

`remove` exists because switching a service between connection methods needs a cross-kind re-add, which `replace` refuses by design.

### Integrations routes

User routes `/v1/integrations/*` and the runtime-facing HMAC proxy `/sandbox/integrations/*` (`src/routes/integrations*.ts`).

Platform model: no provider login. Users connect toolkits, keyed by their Houston user id.

Dismissing the retired plaintext-key file deletes it and clears the flag live, with no restart. Dismiss is idempotent, but a real filesystem failure is reported, never hidden behind `{ok: true}`.

Search scope: an omitted, empty or whitespace-only app scope is `undefined` at the port, never an empty string. A scope that resolves to nothing is retried unscoped and the response says so (`scoped: false`, `unscopedFallback`). A resolved scope never sets the flag. A gateway older than the scope contract returns unscoped items; the proxy must not present them as scoped.

The host executes every authenticated execute directly. Integration confirmations are model-driven `ask_user` questions, not a host gate. Usability is connection intersected with the allowlist, enforced by the cloud gateway; the pod keeps no per-agent grant record.

Acting context: an `x-houston-acting-as` token and a routine's `x-houston-acting-user` pass through verbatim; with neither header there is no acting context.

With several providers registered (custom plus Composio), "no explicit provider" means every provider: search results merge and execute routes by the action's shape (`providerForAction` in `integrations-sandbox.ts`). With only one provider, everything routes to it.

Multi-account: execute forwards the target connection id; disconnect without one removes the whole toolkit.

The generic provider family claims the whole `/v1/integrations` subtree, so the custom-integration definitions group must be registered before it. Only chain order enforces this.

### Integration search fan-out

Lives in `src/routes/integrations-fanout.ts` (`searchIntegrations`). A custom integration alone still offers its connect. A compiled custom tool for the same app is never offered twice. An exact scope match on a custom integration suppresses substring matches from Composio toolkits, which otherwise listed disabled rows ahead of the user's own integration; a scope that matches no custom integration exactly fans out to every provider.

A curated app that another provider also carries is one app to the user: the other provider's connect leads and the custom provider's bare connect row for it is dropped, while its compiled tools stay. A curated alias gives other providers the canonical slug; the custom provider keeps the raw scope and ranks its own exact matches first (`custom/search.ts`). A failed definitions read counts as one provider's failure, surfaced only when nothing else answers.

### Per-provider integrations routes

Lives in `src/routes/integrations-provider.ts` (`handleProviderRequest`). Always answers: an unknown sub is a 404, not a fall-through. Disconnect with `connectionId` removes one account; without it, the whole toolkit. Search with `app` is strictly scoped here; the unscoped retry belongs to the sandbox proxy, so a scoped call never mixes other apps' actions into a caller's merge. The `scoped` echo tells a remote adapter whether the provider honored the scope.

### Integration file arguments

Pinned by `src/routes/integrations-sandbox-files.test.ts`. The sandbox execute route stages file arguments from the calling agent's workspace before the provider runs the action, uploading to the slot the provider minted.

Lives in `src/routes/integrations-sandbox-files.ts` (`stageSandboxFiles`). One stager per process so its action-schema cache is shared. File arguments are uploaded from the calling agent's folder (`integrations/file-staging.ts`); where the host is not beside the files, or the provider cannot stage, params pass unchanged. The agent is looked up only when a file argument needs reading.

### Integrations sandbox proxy

Lives in `src/routes/integrations-sandbox.ts`.

The runtime's `integration_search` and `integration_execute` tools call this proxy, never the provider, so no integration secret sits in the runtime. The host resolves sandbox to workspace owner to provider user id.

With no key configured the proxy answers 503 with a stable `code`, distinct from a relayed upstream 503, so the runtime tool never tells the user to set `COMPOSIO_API_KEY` during an outage. The routines and generic sandbox proxies use the same code.

An optional `app` is a hard scope. An optional `account` targets one of several connected accounts of a toolkit.

Acting identity: the gateway-minted acting-as token for a live user or the routine creator's sub for a fired routine; locally neither, and the provider acts as the owner.

A `FileArgumentError` is returned as the action's failure, phrased for the model to correct its call.

### User integrations routes

Lives in `src/routes/integrations.ts`.

No provider login: the platform key lives with the deployment or behind the gateway adapter. Connect is a real OAuth redirect.

`PUT /v1/integrations/session` keeps the desktop gateway adapter's Supabase token fresh; deployments without a sink accept it as a no-op so signed-in users never see a false error.

A legacy per-user "Composio for you" credentials file means the user connected apps under the old per-user-account model and must reconnect once; their old personal key is no longer used. Local only. The banner is re-checked live, and dismiss deletes the file idempotently while surfacing real failures. Deployments without the file accept dismiss as a no-op.

The module owns the whole `/v1/integrations` subtree for every method: unwired answers 503 "integrations not configured", wired answers 404 for unknown providers. Paths are not normalized. Custom integrations mount first for this reason.

### Smaller rules

`custom-integrations-error.ts`, `integrations-errors.ts`: failures map to stable JSON bodies with a `code`; clients classify on the code, never the status, and host routes and pool ops relay the same refusals.

## Routes: portable agents and migration

### Capped unzip

Lives in `src/routes/capped-unzip.ts` (`unzipCapped`). Limits apply before anything inflates: fflate sizes each deflated entry's output from the declared size and never grows it, and stored entries are slices, so summing declared sizes in the filter bounds memory even when sizes lie. Directory entries are dropped.

### GitHub source parsing

Lives in `src/routes/github-source.ts` (`normalizeSource`). Ported from the Rust engine. Accepts the short form, full URLs (with `.git`, `/tree/main`, query, fragment), the SSH form and pasted shell commands, anchoring on `github.com`; returns null otherwise so install answers a typed 400. Owner charset `[A-Za-z0-9-]`, repo `[A-Za-z0-9._-]`.

### Desktop to cloud migration

Lives in `src/routes/migration*.ts`.

One shared scope classifier decides what leaves the machine. `.houston/integrations.json` and pi session `.jsonl` files never do.

Import is allowlisted, so an archive cannot write engine internals. Import skips existing files, so a re-POST after a dropped connection is a safe resume. A retry still rebuilds a session whose transcript was uploaded but whose session was not.

Sessions are re-synthesized from imported transcripts; the imported block is closed by a boundary note so stale imperatives in old history never read as pending work on the first turn. A re-import leaves the session directory alone. The worker's lazy tree lists sessions in the store with nothing on disk, and that counts as existing.

Without a verified actor, the archive's creator stamp is dropped.

The same export and import copy an agent with its chats on one host; the source is untouched.

### Migration export

Lives in `src/routes/migration-export.ts` (`exportMigrationChunk`). Every requested path is re-validated against the scope classifier, so a client cannot widen what leaves by editing its manifest. Files deleted since the manifest are skipped. Agent data is compressed; working files (often already compressed) are stored.

### Migration on an external store

Pinned by `src/routes/migration-external-store.test.ts`. Managed pods run with `HOUSTON_STORE_URL`: `/data` is an ephemeral emptyDir hydrated from the object store and synced back, with no persistent volume. Everything a migration import writes (files, re-synthesized sessions, the completion marker) must land under the sync root, outside the sync exclude set (`credentials.json`, claude-login credentials, `db/`), and survive a final sync on drain and a fresh pod's hydrate.

### Migration import

Lives in `src/routes/migration-import.ts`.

Each entry of an uploaded chunk is re-validated against the shared allowlist, since the archive is client input; nothing may write `auth.json`, engine internals or outside the root. Existing files are skipped, from one listing taken up front, so a re-POST is a resume.

pi sessions are anchored to the agent's directory (cwd), so the source machine's `.jsonl` files cannot be transplanted. Sessions are rebuilt from the transcript's user and assistant text, as the boot chat-history migration does; pi persists a session only once it holds an assistant message. The session id names a directory, so path-like ids are refused. A lazy tree (pool worker) lists sessions held only in the store, which count as existing. The imported block is closed with `importedHistoryNote`.

Imported transcripts emit conversation reactivity, not Files. An unparseable transcript is still imported, just without a session. The verified importer is stamped as each routine's `created_by`.

### Legacy Composio account scan

Lives in `src/routes/migration-legacy-composio.ts`. The Rust app connected apps through the user's own Composio account, whose credential at `~/.composio/user_data.json` outlives the upgrade, so the migration source can list connected toolkits with the two REST calls the old engine made. Best-effort and read-only: any failure yields `[]` (logged as a warning) and the wizard skips the reconnect step. Only toolkit slugs leave the module; the key is never uploaded. Each request has an 8-second budget so a slow API never holds the offer screen. Slug normalization mirrors the Rust engine.

### Migration scope

Lives in `src/routes/migration-scope.ts` (`classifyMigrationPath`). One classifier for the source manifest, export re-validation and import allowlist. Left behind: `.houston/sessions/**` (Rust-era trackers consumed by the boot chat-history migration), `.houston/runtime/sessions/**` (re-synthesized on the target), `.houston/integrations.json` (retired per-user Composio state that can hold a plaintext key; only toolkit names are read for the reconnect prompt), `AGENTS.md`/`GEMINI.md` (symlink mirrors), and every other dot-path. Limits: 50 MiB per file (larger files are reported), 64 MiB compressed body per request, 512 MiB unpacked and 10,000 entries per request against zip bombs. `toolkitsFromIntegrationsJson` accepts both shapes the Rust engine accepted.

### Migration source

Lives in `src/routes/migration-source.ts`. The cloud app spawns the bundled host against the old `~/.houston` (boot runs the layout and chat-history migrations first) and lists every agent with its manifest in one call. Exclusions are listed with reasons for the wizard. Rust-era Composio toolkit slugs feed a reconnect checklist; the legacy `~/.composio` account probe is best-effort and runs alongside the disk walk. An agent deleted between list and read is skipped. The Rust-era color from `.houston/agent.json` is included so the wizard seeds it.

### Migration routes

Lives in `src/routes/migration.ts`. The source (the desktop's briefly spawned local host) exports chunks as zip; the target (a cloud pod behind the gateway's `/agents/:slug/*` proxy) imports them, then `complete` writes the server-side marker that `status` reads for resume. A corrupt marker reads as not migrated, which is a safe redo. `sessions=0` writes transcripts without rebuilding pi sessions, for callers that stamp `needsSessionReplay` ("Copy an agent"), since a synthesized session on top would duplicate history.

### Portable agents (`.houstonagent`)

Lives in `src/routes/portable*.ts`. Export, preview and install move an agent between desktop and cloud unchanged. An installed routine gets a new id, because hosted trigger tables key on routine id globally.

### Portable install

Lives in `src/routes/portable-account.ts`. Preview takes raw zip bytes; install takes JSON (`archive` base64 plus `agentName`) and an optional selection (absent installs everything). The installed agent's routines get fresh ids (`remintRoutineIds`). Packs strip the exporter's identity, so seeded routines take `created_by` from the installer with the routine-write actor policy (gateway sub or org owner on a managed pod, local user on desktop). Seeds are written with the same serialization the browser adapter uses on hosted cloud. A non-POST falls through to the chain's 404.

### Portable export

Lives in `src/routes/portable-export.ts`. `HOUSTON_VERSION` in the manifest is versioned independently of the wire protocol. The body is a bare selection or `{ selection, meta? }` (`meta.anonymized` stamps the manifest), treated as client input. A wrong method falls through to the runtime.

### Portable preview

Lives in `src/routes/portable-preview.ts`. The share wizard's pick screen: instructions, skills, routines and learnings with one-line excerpts capped at 160 characters. A wrong method declines so the request continues to the runtime.

## AI Manager internals

### Approval carry

Lives in `src/assistant/approval-carry.ts`. A pool worker carries one conversation's requests (with expiry) and message reservations between the turn that raised a card and the turn the answer starts (kept with the agent's state, `turn/turn-approvals.ts`). Grants do not travel. Adoption drops malformed, expired or foreign-scoped entries, so a damaged file can at worst ask again. Spent means gone.

### Approval presentation

Lives in `src/assistant/approval-presentation.ts` (`approvalPresentation`, `substituteApprovals`). Default English button labels ride the wire so a shell without wording, or a decoder requiring the field, still has two buttons; surfaces replace them. Substitution replaces every question claim, including history and nested sync frames, scoped to a conversation except on the board. The structural `approval` block is emitted only next to an id this host issued; for unknown ids both the id and any runtime-written `approval` block are stripped, leaving a plain question.

### Approval records

Lives in `src/assistant/approval-record.ts`, `approval-key.ts`, `approval-scope.ts`. `APPROVAL_TTL_MS` is 10 minutes for a request and its receipt. The card's summary, detail and structural args are derived from the same params the key hashes, never passed in beside them. `approvalKey` sorts object keys and drops undefined values so equivalent spellings agree, keeps array order, and changes with anything that changes what the call does. Every store read narrows by agent and conversation first; an omitted conversation (every conversation of the agent) is allowed only for clearing, never for spending.

### Assistant approvals store

Lives in `src/assistant/approvals.ts` (`ApprovalStore`, `assistantApprovals`).

The model cannot mint an approval. The host issues a `requestId` when it raises a card; only the user's own next message on the host's conversation route (`assistant/receipts.ts`), or a constrained one-use grant carried by that message, turns it into a receipt. The runtime presents the id back and the host decides.

Checked at consume time: the key is sha256 of the operation plus canonicalized arguments, recomputed from the submitted params (key order does not matter, array order does, and undefined equals absent); the id is 128 random bits; conversation and agent scope (`approval-scope.ts`), so an unattended routine turn never inherits one; single use; short-lived.

A message that answers nothing retires every pending card in that conversation (dismissed, cleared, edited out, replied past); only answers arriving with the message survive to be spent on the turn it starts.

Held in memory on purpose: a restart drops pending approvals and fails closed. Pool workers, which live one turn, carry one conversation's records to the next turn (`approval-carry.ts`) under the same expiry. `pendingCount` is reported to the activity probe because a host that stops asks those people again.

### Catalog parsing

Lives in `src/assistant/catalog-parse.ts` (`parseAssistantCatalog`).

A failing document returns null, which the caller turns into "assistant family off", never a crashed boot. Tests use a fixture so parser contracts do not move with the real catalog.

Descriptive fields (`rawResponse`, parameter `description` and `source`) are optional but checked when present, because the parsed type claims their types and `houston_describe` prints them verbatim. Nested `fields` are checked because the host resolves them against live lists. Per-parameter `schema` and `returns` stay unknown (arbitrary JSON Schema, checked later by `Value.Check`); the final cast relies on the envelope having pinned everything else.

`hands` (the card that reaches a hidden operation, or a statement that none does) is a real union whose card and screen lists are read from `@houston/domain` and `@houston/protocol`; a local copy would refuse documents carrying additions made there and switch the assistant off after a regeneration. It is optional so older catalogs load.

A hidden operation is indistinguishable from an absent one.

### Embedded catalog

Pinned by `src/assistant/catalog-source.test.ts`. The catalog is compiled into the build; the test proves the embedded document is the real one, passes the envelope guard and resolves routable operations. Counts are floors, since the catalog grows. An unreadable embedded document fails closed and says so once.

Lives in `src/assistant/catalog-source.ts` (`processAssistantCatalog`, `readEmbeddedCatalog`). `pnpm gen:assistant-catalog` writes the JSON beside the module and the import inlines it into every artifact (container entrypoint and Bun-compiled sidecar), so there is no file to locate and the host's dispatcher and the runtime's tools never read different catalogs. The document goes through the same envelope guard as any other (re-serialized, one validation path). A failing document is a broken build: the family stays off, loudly. A null result is cached as a real answer. Read at boot so the startup log names what the build carries.

### Catalog types

Lives in `src/assistant/catalog-types.ts` and `catalog.ts`. One entry per operation carrying an `@assistant` JSDoc in `packages/engine-adapter` or the SDK's REST modules, generated into `assistant-catalog.generated.json` and embedded. The catalog is data: new operations ship by regenerating. It is read in the host because the runtime depends on the host, never the reverse. Shapes are `@houston/domain`'s declarations, with parameter schemas read as typebox `TSchema` for `Value.Check`. `AssistantHands` is imported from domain's leaf module, the subpath the generator uses, since the generator runs under `--experimental-strip-types` and cannot resolve the barrel's re-exports. `findVisibleOperation` returns undefined for hidden operations.

### Gateway entity directory

Lives in `src/assistant/entity-directory-gateway.ts`. Every list is authorized with the host credential and the acting identity. The gateway's agent identity can differ from the pod's directory-derived id. Agent-data routes answer document envelopes; gateway collection routes answer arrays.

### Local entity directory

Lives in `src/assistant/entity-directory-local.ts`. Local hosts have personal workspaces; teams, people and invites are gateway-owned. `UnsupportedEntityCollectionError` is thrown instead of returning `[]`, because an empty list leads the model to offer to create the first one. Each mission carries its chat, including chats off the convention address.

### Entity directory

Lives in `src/assistant/entity-directory.ts` and `entity-directory-wire.ts`. Everything the dispatcher can name is listed live for the acting user: the local store when the host is its own gateway, the gateway's list routes on a managed pod (whose store holds only the assistant). One directory per call, read lazily. Each mission carries its chat address (`session_key` or the convention), because the board alone records non-conventional chats and the protected-chat guard needs it. Wire parsing reads only identity fields; a malformed directory fails, never reads empty.

### Entity resolution

Lives in `src/assistant/entity-resolution.ts` and `entity-resolution-values.ts` (`resolveEntityParams`, `DirectoryReader`).

Every identifier the model passes is turned into the real one or refused with the values that exist. Which parameters name a thing is the catalog's `resolver`, set by the generator from the route the value is spliced into, so new operations on known collections are checked once annotated. Tests use fixture operations so they do not move with the real catalog.

Directory failures propagate to the reporting path: an unavailable list never becomes empty, and an empty list never authorizes an unchecked identifier.

Three shapes: top-level strings, lists of identifiers, and fields one level inside body objects (`manifest.enabled`, `assignments[].userId`). An object entry in a list belongs to the nested pass. Parents resolve before children regardless of declaration order.

Matching is by id or exact name (an address for people and invites), case-insensitive. Lists are read once per call (memoized), since two reads could disagree and the refusal would name values from neither. The caller's object is never mutated.

`.assistant` is absent from the reachable set, so its name and id read as nonexistent.

### Closed value sets

Lives in `src/assistant/entity-values.ts` (`valueProblem`). A color is typed `string` (palette id, a `#rrggbb` hex, or `""` to clear), so the schema cannot close it; the check sits beside entity resolution and refuses with the palette.

### Grants

Lives in `src/assistant/grants.ts` (`GrantStore`). A grant pre-approves one call and is held against that call's request until performed. If the app refused the call (nothing happened, for example a name already taken), the grant comes back unchanged so the approved retry needs no card; a call that may have happened never returns it.

### Hire card

Lives in `src/assistant/hire-summary.ts`. A hire's card asks its name, then shows color, the role its instructions declare and the instructions whole.

### Manager owner

Lives in `src/assistant/manager-owner.ts`. On a managed AI Manager pod only its owner reaches the manager, so every routine there is theirs: `managedOwnerSub` returns the manager's person there and the org owner elsewhere, and `actingMayRunRoutine` lets that person run any of its routines (the control plane fires them as that person).

### Message admission read

Lives in `src/assistant/message-admission-read.ts`. Reads the same persisted admission record the standing runtime claims before execution, using the runtime writer's own path helper (`messageAdmissionFileName`) so a drift cannot make every retry read as new work. Takes the already parsed body.

### Message receipts

Lives in `src/assistant/message-receipts.ts` (`prepareMessageReceipts`) and `message-guard.ts`.

Host-owned fields (`approvals`, `grants`, and the host's message fields) are never forwarded. When none were present, the original bytes travel unchanged.

A non-JSON body is left to the channel. A malformed message (no `text`) mutates nothing and reserves nothing, but still loses host-owned fields.

Only a message the user sent, with a card live for this agent and conversation, mints or retires receipts, so the hot path costs one map lookup.

A grant is the approval of the message it rode on, for that turn only.

Receipts never reach the runtime, even spent or expired, and the retry fingerprint the runtime sees is authored here. A rejected turn never carries the grant into the conversation.

The message guard never evicts a live reservation to admit a new one, since that would let a retry mutate the receipt it should leave alone.

### Receipt minting

Lives in `src/assistant/receipts.ts` (`applyApprovalReceipts`). The user's message is the only place a yes becomes a receipt, because a runtime cannot author a user message and routine turns never pass through this route. Order: record each carried approval against its live request for this agent and conversation, then retire every other request in the conversation. Receipts ride their own `approvals` field, dropped before the request continues, so runtime, model and transcript see only what the person wrote.

### Served operations

Lives in `src/assistant/served-operations.ts` (`unservedOperations`). About a quarter of the catalog exists only on the gateway (spaces, teams, billing, hosted profile). The unserved set is derived from the host's own route registry, never listed by hand: an operation is unserved exactly when no registered route answers its address. "Served" means the address resolves to a declared handler, not that the capability is wired; a family that declines at runtime still serves it. Matching is structural (catalog `{id}` versus registry `:routineId`), with probe values for segment and path parameters (a path parameter's separators survive, so `*rest` routes match). Hidden operations are considered too; unroutable ones are refused elsewhere. `SERVED_FROM_AN_OWNED_SUBTREE` names operations answered from an `owns` boundary (such as `triggerTypes` under `/v1/integrations/*rest`), which publishes no descriptor; loosening the match to `owns` patterns would mark every unenumerated address as served. The module imports the registry's declaration door, not `./all`, to avoid an import cycle.

Pinned by `src/routes/assistant-served-parity.test.ts`. The registry's unserved set (stamped into the coordinator's environment, so it is what the desktop AI Manager believes about itself) must equal the cloud-only probe table found missing by booting a host. An unserved name with no cloud-only probe means a route moved; a cloud-only probe the registry thinks is served means a path started resolving locally. Index names are read from group lines, not by substring, because `removeAgentCustomIntegration` contains `moveAgent`.

### Approval card summary

Lives in `src/assistant/summary.ts` (`confirmationSummary`, `approvalArgs`). Authored by the host from the catalog and the exact arguments, never by the model, in the same place that issues the receipt, so what a person reads and what their yes authorizes cannot drift. The account is structural (`args`), so the surface words it in the reader's language (`app/src/lib/interaction-approval-labels.ts`); `title` and `detail` are the host's English rendering for text-only surfaces. Arguments are shown whole as labeled facts: nested values are named by path (keys with separators or quotes are quoted so two nestings never share a name), values over 80 characters or multi-line move to `detail`, and only values over 2,000 characters or lists over 20 items are cut, stating the exact amount left. Hire instructions stay whole. Empty values, empty lists and empty groups read differently; strings that look like placeholders or quotes are quoted. Two writes that differ late must read differently. Undefined values are not arguments. No limit is not an empty allowed list.

### Acting header decoding

Lives in `src/auth/acting.ts` (`routineActorFor`, `actingAuthorFor`, `actingSubFromHeader`, `actingViaFromHeader`, `actingDelegatorFromHeader`). The gateway stamps `x-houston-acting-as: acting-v1.<payloadB64Url>.<sig>` on every proxied request. A pod cannot verify the signature (the secret never leaves the gateway), so decoding is valid only behind a trusted gateway. Expiry is not checked: the token was minted on this request and the identity is attribution the gateway re-authorizes at fire time. Malformed values read as no identity and never throw. `via` names the credential that drove the request (`assistant` for the AI Manager, `api` for public API, MCP and A2A writes). `actingAuthorFor` is null off the gateway so single-player files stay identical. `routineActorFor`: on a fronted pod the acting sub (the local user id has no upstream membership and would 401 every integration call), else the org owner; on the desktop the local user.

### Agent display name

The gateway owns a cloud agent's display name (a rename never moves the folder) and sends it on every proxied request. Only a gateway-fronted host takes the header; elsewhere it is client input.

### Token verifiers

Lives in `src/auth/verify.ts`. Only authentication failures resolve to null; anything else is rethrown. `SingleUserVerifier` resolves the boot token to the owner, so the whole authorize seam runs unchanged locally; the token is still required, since other local processes must not drive agents. `ServiceTokenVerifier` maps static tokens (full-length random secrets) to principals and falls through to the wrapped verifier; malformed entries are a startup error. The Supabase verifier lives outside the repo; the gateway authenticates the shipped cloud.

### Smaller rules

`src/auth/assistant-call.ts` (`isAssistantRequest`): behind the gateway, the gateway mints `via: "assistant"` (it strips client acting headers); on desktop and self-host the manager's dispatcher loops back with the same bearer the app holds, so it adds a header carrying a per-process secret (in memory only, never logged, never in a runtime's env, never in a response), accepted only from a loopback peer and compared in constant time. The two proofs are never mixed.

`src/auth/agent-name-header.ts`: in a cloud org the folder (and engine id) never changes; a rename writes only the registry name, which the gateway stamps on proxied requests and op envelopes, percent-encoded. Trusted only behind the gateway. An invalid or missing name is not an error. The id stays the folder's.

## Integrations

### Composio adapter

Lives in `src/integrations/composio*.ts`.

Requests use the `x-api-key` platform header. Categories come from `meta.categories` (`{id, name}`); the top-level `categories` is null.

The toolkit catalog is paginated past `limit=1000` (over 1,500 toolkits); reading one page dropped apps.

Toolkits with no auth stay in the catalog flagged `noAuth` and read as connected and "ready to use"; connecting one would only produce Composio's `Auth_Config_NoAuthApp` 400, so `NO_AUTH` short-circuits before the create POST with an actionable error.

Auth configs are cached per toolkit. The connect redirect goes to the provider's OAuth page, never Composio's hosted form. Hosted link prefill carries the field value.

API-key toolkits get an auth config on the toolkit's scheme with empty credentials so the hosted link asks the user for their key; `use_composio_managed_auth` 400s for these. A toolkit with no managed app and OAuth plus API-key schemes (Meta Ads) skips OAuth (a custom OAuth config with empty credentials can never complete) and lands on API key.

Metadata can advertise managed OAuth whose managed app has expired (the create 400s "Missing required field Client id"); the connect falls through to a user-collectible scheme, or, when the toolkit is OAuth-only, surfaces the operator remedy (register an OAuth app in the Composio dashboard; `resolveAuthConfig` then reuses it). A transient 500 on the managed create is not evidence the app is gone and does not fall back.

A toolkit detail 404 (`Toolkit_ToolkitNotFound`) is a clean unknown-toolkit answer.

A connected account is the caller's only when its top-level `user_id` is a string equal to the caller. Disconnect treats a DELETE 404 as success, because Composio can remove accounts itself or a retry can race a prior disconnect.

Search merges the scoped query over connected toolkits with global discovery (the scoped match no longer suppresses discovering a new app), dropping duplicates and carrying status. Composio's action search scores near zero for a bare app name, so the toolkits catalog resolves names to slugs as toolkit-level entries. A phrasing that scores zero on a connected app triggers a no-query scoped listing. No scoped query runs when nothing is connected.

Search and execute pin `latest` toolkit versions. Composio defaults to the base snapshot, whose connectors age until the third-party API retires what they use (a LinkedIn post kept sending a retired version header and failed 426 while auth worked), and pinning both keeps the schema the model read and the connector that runs the same.

Multi-account labels never come from tokens. Composio masks auth payloads (`id_token` is "REDACTED"), so a label comes from executing the toolkit's read-only profile action against that account once, then cached. Ownership is checked with a GET of the single account before a targeted delete; a wrong toolkit deletes nothing.

Lives in `src/integrations/composio.ts`.

Speaks Composio's v3 REST API directly, in platform mode: one project key (`x-api-key`), each Houston user a plain `user_id`. Users only OAuth the app itself. The adapter runs where the key legitimately lives (cloud host, self-host); the desktop uses the gateway adapter (`remote.ts`) and never holds the key.

Connect uses `POST /api/v3.1/connected_accounts/link`. The legacy `POST /api/v3/connected_accounts` initiate is retired for Composio-managed OAuth (it 400s for newer orgs). Auth configs are resolved per toolkit on demand (reuse, else create on managed auth), so there is no per-toolkit dashboard step.

`PREFILLED_CONNECTION_DATA`: Houston answers some initiation fields for the user, because the hosted page renders every required field as an editable box (HighLevel's "Token Type" is relayed as `user_type`, accepts only Location or Company, and a user pasted their token into it). Prefilled toolkits try the direct initiate first, which redirects straight to the provider's OAuth page; any rejection falls back to the hosted link with the prefill as the value. Location is the token type most HighLevel actions need.

The toolkits catalog is cached per process for an hour with a shared in-flight promise for search; the UI listing always fetches fresh.

`TOOL_VERSION` is `latest` (Composio's recommendation for agents; the model re-reads schemas from search each turn), pinned on search and execute. Unversioned `/api/v3/tools` serves only the base snapshot's tools.

`ownedConnection` is the unlabelled, fail-closed ownership primitive shared by the poll and the targeted disconnect, which must never probe an account it is about to delete. Bulk disconnect lists and deletes all of a toolkit's accounts in parallel; any failure rejects, but a 404 counts as success.

The direct adapter ignores the acting context: identity is the verified `userId`. `connected_account_id` targets one account; Composio requires `user_id` alongside it and rejects accounts that are not the user's.

### Composio status annotation

Lives in `src/integrations/composio-annotate.ts` (`annotate`). Every entry gets its status from the acting user's active connections; the direct adapter never produces `blocked` or `unknown`. No-auth toolkits read connected. Account lists are attached only for toolkits with more than one active account.

### Composio auth configs

Lives in `src/integrations/composio-auth-config.ts` (`resolveAuthConfig`, `candidateSpecs`). Reuse an enabled config, else create one: `use_composio_managed_auth` when Composio advertises managed OAuth (no app registration on our side), else `use_custom_auth` on the toolkit's first user-collectible scheme with empty credentials (the hosted link collects `connected_account_initiation.required` fields). Bare custom OAuth is never a fallback, since an empty OAuth config cannot complete. Metadata is a claim: only a 400 on the managed create is survivable (the managed app does not exist) and falls through; with no collectible scheme left, the OAuth-only toolkit gets a typed 400 whose code is the wire's `IntegrationConnectRefusalCode` (the message keeps the operator remedy for logs and self-host). NO_AUTH toolkits and unknown slugs answer clean 400s. Configs are cached per process.

### Composio catalog pages

Lives in `src/integrations/composio-catalog.ts` (`fetchAllRawToolkits`). Composio caps a page at 1000 regardless of `limit`, and the catalog exceeds one page, so `next_cursor` is walked to the end. Seen-cursor and page-count guards (at most 10 pages) stop a misbehaving upstream; a failing page throws rather than serve a partial catalog.

### Composio file leg

Lives in `src/integrations/composio-files.ts`. The direct adapter makes the same two calls the gateway makes (describe at the `latest` version, `POST /api/v3.1/files/upload/request`), so files stage identically everywhere. An Azure-backed slot needs the blob type header, per Composio's docs.

### Composio HTTP transport

Lives in `src/integrations/composio-http.ts`. `ComposioApiError` carries the upstream status (the auth-config fallback keys off a 400) with a stable message shape. Composio drops idle connections now and then: a read is resent once on a dropped-connection code (`ECONNRESET` and friends, from undici's `cause` or Bun's own error), a write never is, since the first attempt may have landed. DNS failures and refusals are not retried.

### Composio identity cache

Lives in `src/integrations/composio-identity-cache.ts` and `composio-identity.ts`. Composio masks every token-like `data` field, so an account's identity comes from one read-only profile action executed against that account (`IDENTITY_PROBES`, verified live) and cached for the process. Toolkits with unmasked hints never reach the probe. Probes have a 10-second deadline because the transport has none and every list for the account shares the in-flight probe. A refusal or a reply without identity is billed and repeatable, so it waits out the failure TTL; thrown errors and timeouts may retry on the next list. A disconnect invalidates an in-flight probe. Identity fields are tried at the top level and under `response_data`, capped at 100 characters.

### Composio name resolution

Lives in `src/integrations/composio-resolve.ts`. An app is named in a query only when its normalized name or slug (length 2 or more) equals a contiguous run of up to four query tokens, never a substring inside a word. Matches are ordered longest first and capped.

### Composio search resolver

Lives in `src/integrations/composio-search.ts` (`resolveScopeToolkits` and the merged search).

Name matching is whole-word on name or slug ("inbox" must not resolve "box").

Explicit scopes: an exact name or slug match beats every substring match. The length guard applies only to the loose tier, so an exact short name ("HR") resolves while a short loose scope refuses to guess. Loose containment works in both directions, but a scope matching two unrelated apps resolves to neither. Distance is judged on the slug as well as the name (so "LinearB" is not taken for Linear).

A scoped search is a hard filter: no global or connected queries run, and no provider-internal unscoped fallback pollutes the multi-provider merge.

Composio ranks by toolkit token and pages alphabetically, so an action named in the query (`WHATSAPP_SEND_MESSAGE`) is fetched directly when the phrasing names it; a plain phrasing never spends that fetch. Prefix matches are filtered to the toolkit (`ZOHO_BOOKS_*` belongs to `zoho_books`).

A named, connected app whose phrasing scores zero gets its own listing at once; an unconnected named app surfaces as a toolkit row for a scoped re-search, never as fifty actions. The every-connected-app dump fires only for queries that name no app. Loose text matches of an unconnected named app never outrank a connected app.

Multi-account annotation lists only toolkits with two or more active accounts.

Lives in `src/integrations/composio-search.ts` (`searchComposio`). Discovery is progressive: a query that names an app gets that app's actions scoped hard to it, never a global list where other connected apps drown it. Lookups merge in this order: (1) named-app lookups (explicit `app`, or apps resolved from the text), with a listing fallback when the scope is explicit or the app is connected, and when the scope is explicit these are the whole result; (2) the query scoped to connected toolkits, listing them only when the query named no app; (3) unconnected resolved apps without the listing fallback, after connected results; (4) a global query that always runs; (5) catalog resolution, which adds toolkit-level rows for named apps with no action match. Toolkit rows are stamped by `annotate()` (`composio-annotate.ts`), the one source of status. `actionSlugOf` recognizes a query that is an action slug (prefixes with or without toolkit underscores) and fetches it directly with `tool_slugs`; a failure of that exact lookup never fails the search. An unresolvable explicit scope returns empty with `unresolved`; the sandbox proxy owns the single unscoped retry.

### Composio wire mapping

Lives in `src/integrations/composio-wire.ts`, the only place Composio's response format is known. Categories prefer the kebab-case `meta.categories` id, which the UI labels. `accountLabelOf` reads only identity hints from the auth payload: an OIDC `id_token`'s email or name (Google apps, LinkedIn, Discord), Notion's `workspace_name`, Jira's and SharePoint's `subdomain`, or a literal `email`; never tokens, and labels are capped at 100 characters so a token can never become one. JWT claims are decoded without verification because they are display-only. Composio's FAILED, EXPIRED, INACTIVE, REVOKED and unknown statuses map to `error` (needs reconnecting).

### Fake integration provider

Lives in `src/integrations/fake.ts`. The second implementation of the port, so the contract test proves the interface is not Composio-shaped. Connections start pending and are completed by the test. Scoped search follows the shared rules and never returns a bare empty result for a resolved scope.

### File argument schema walk

Lives in `src/integrations/file-args.ts`. Composio marks file arguments with `file_uploadable: true` (Gmail `attachment`, Drive `file_to_upload`), and execute accepts only `{ name, mimetype, s3key }` with a key from Composio's files API, so workspace paths are uploaded first. The walk mirrors Composio's SDK `walkFileUploadableLeaves`, resolving `anyOf`/`oneOf`/`allOf` to the variant matching the value, so one file or a list both work. Depth is capped at 32. Lists are processed one item at a time. A value that is already a Composio key (upload keys under the project, or download keys from an earlier action) is forwarded untouched; agents may also pass `{ s3key: <path> }`. Uploads carry a lowercase hex MD5.

### File argument staging

Pinned by `src/integrations/file-staging.test.ts`. Composio's tool listing declares file-uploadable fields; Gmail takes one file or a list, Drive exactly one. `describeAction` is the file leg; identity is the verified user.

Lives in `src/integrations/file-staging.ts`. Agent-supplied workspace paths for file arguments become `{ name, mimetype, s3key }`: read, reserve an upload slot, PUT, swap. Runs on the engine host, the only process that can read the workspace. `MAX_FILE_ARG_BYTES` is 50 MiB per execute (Gmail refuses past 25 MB; Composio documents none), staged one file at a time. Uploads time out after 5 minutes. Schemas are cached per action for an hour, keeping only file-bearing ones whole. `FileArgumentError` messages are written for the model. A describe failure that is the deployment refusing (signed out, app off, locked org) surfaces; any other describe failure never fails an execute that may carry no file.

### Integration provider port

Lives in `src/integrations/provider.ts`.

`ActingContext`: `actingAs` (a gateway-minted token for the user driving a message turn) or `actingUser` (a routine creator's Supabase `sub`, since routine turns get no per-turn token); exactly one in cloud, neither locally. Direct adapters ignore both.

`ScopeOutcome`: direct adapters answer `resolved` or `unresolved` (empty, never an unscoped fallback); only the remote adapter may answer `ignored`. `scope` is present only when an `app` was requested.

The port is the only thing routes and tools depend on. Same code in every deployment; availability is a capability flag, not a fork.

File arguments are optional on a provider; without them file arguments pass as given.

### Integration registry

Lives in `src/integrations/registry.ts`. Providers keyed by id; a duplicate id is a wiring error; `get` throws on unknown ids; `has` narrows arbitrary strings. An empty registry is valid (integrations off; the capability flag is false and routes answer 404 or 503).

### Gateway integration adapter

Lives in `src/integrations/remote.ts` (`RemoteIntegrationProvider`).

The platform key must never ship in a client binary (anyone could extract it and act as any `user_id`), so the desktop forwards every call to the cloud host's `/v1/integrations/*` with the user's Supabase token. The upstream derives the Composio `user_id` from the JWT `sub`, so the port's `userId` arguments are ignored and connections follow the user across desktop and cloud. With no session the adapter is not ready and throws a typed signin-required error (409), and nothing leaves the machine unauthenticated.

Acting precedence on search and execute: an `actingAs` token first (so an agent can only act as the person driving the turn), then `actingUser` with the pod's own `HOUSTON_HOST_TOKEN` and `x-houston-acting-user` (the routine path, managed pods only), then the frontend session. The desktop has no pod token.

Search items are read tolerantly: a valid `status` passes through (a later gateway may send `blocked`); absent or invalid derives from `connected`.

Scope echo: `scoped: true` means hard-scoped, `false` means unresolved and empty; no echo from an older gateway is reported as scope `ignored`, so unscoped results are never presented as the app's and their emptiness never reads as "no such app".

`connectionId` on disconnect narrows to one account; an older upstream ignores it and removes the toolkit, never a broader action for a single-account user. A connection poll 404 is a normal null. `describeAction` 404 on an older gateway reads as unknown and execute proceeds as before.

### Shared scope resolution

Lives in `src/integrations/scope-resolve.ts` (`resolveScopeRows`). Every provider resolves `app` with the same rules so one scope means one thing across the merge. Normalization lowercases and drops non-alphanumerics. Exact slug or name matches win with no length guard; otherwise containment in either direction yields only the single closest candidate by name or slug distance.

### Integration port types

Lives in `src/integrations/types.ts`.

Provider-agnostic shapes; no provider's wire types pass the adapter, so a new provider is a new adapter only. Platform credential model: one platform key, users are opaque `userId`s, and per-user state lives with the provider.

A toolkit can hold several connections; `accountLabel` comes from the provider's auth payload (OIDC email, Notion workspace, Jira subdomain) when available, with `createdAt` as the fallback for telling accounts apart. `accounts` on a match is attached only when there is more than one.

`IntegrationAppStatus` drives the agent's speech act: `connected` (use it), `connectable` (offer `request_connection`), `blocked` (admin policy; tell the user to ask their admin, never imply Houston lacks it), `unknown`. Nothing in this repo produces `blocked`; the allowlist lives in the cloud gateway, and the enum and rendering exist so a gateway that annotates items lights it up without changes. Without `status`, a returned match maps to `connectable` or `connected`, since a genuine miss is an empty result.

An empty `action` marks a toolkit-level entry.

A direct adapter is always ready; the gateway adapter is ready only when signed in. `IntegrationSigninRequiredError` maps to 409 `signin_required`. `IntegrationUpstreamError` relays an already actionable status and body. A JSON content type is a claim: a malformed body still yields the typed error with the real status and the raw text.

### Workspace file reads for apps

Pinned by `src/integrations/workspace-file.test.ts`. Only files inside the agent's folder are read: both the path string and the file's real location must be inside it.

Lives in `src/integrations/workspace-file.ts` (`workspaceRelFor`, `agentFileReader`). An absolute path from another root of the same agent (an earlier turn's `/work/houston-turn-…/store/workspaces/<key>/…`) is found by its `<Workspace>/<Agent>` key. POSIX, UNC and Windows drive paths are absolute; Windows paths compare case-insensitively. Only a regular file whose real path is inside the agent's folder is read: links leading elsewhere or nowhere, folders and devices are refused, and the final open refuses a link swapped in after the check. A lazy turn tree fetches missing files from the store; `ready` waits for deferred hydration.

## Custom integrations

### Add input

Lives in `src/integrations/custom/add-input.ts`. `replace: true` turns a same-slug, same-kind add into an in-place spec swap that keeps the credential, the agent's self-repair path when a compiled integration covers fewer actions than the docs.

### Custom add operation

Lives in `src/integrations/custom/add-op.ts`.

The OAuth capability gate is enforced here: a deployment that cannot receive the redirect never stores pending OAuth definitions.

The slug `executor` is reserved; the engine's internal toolbox lives under it and the store's duplicate check cannot see that.

Replace is spec repair: the added date survives; the credential survives only when origins are provably unchanged, and then the existing auth mode is kept regardless of the input's `auth` (never a downgrade). Teardown and recompile follow the refresh sequence. A failed replacement clears what the failed compile registered and restores the previous view. A definition that cannot compile is never persisted. When the carry is refused, the old secrets are deleted while the old definition still names them.

### MCP auth failure text

Pinned by `src/integrations/custom/auth-failure.test.ts`. HighLevel's MCP server returns a wrong-token refusal inside an `isError` tool result with HTTP 200, so the text is read for the verdict only for MCP results.

Lives in `src/integrations/custom/auth-failure.ts`. MCP servers report a rejected token inside a successful `tools/call` (`isError`), so the executor never sees a 401. The text check is deliberately narrow because a false positive sends the user to re-enter a working key: an explicit HTTP or status 401, or a named credential (API key, access token) called invalid, expired or revoked. A bare "unauthorized", "invalid key", a 401 inside other words, or a 403 (permissions) does not count.

### Credential save

Lives in `src/integrations/custom/credential-op.ts`. Providing a key declares that the service needs one, so collectible auth is ensured even for definitions added as `none`. Validation is advisory: placement is a per-service guess, so a failed probe with a real key never blocks the save; the verdict rides as `verified`, and a bad key surfaces on first use with the `request_credential` hint.

### Curated ManyChat contract

Pinned by `src/integrations/custom/curated-manychat-requests.test.ts`. No one on the team has a ManyChat account, so the request shaping is pinned against a stand-in: bearer on every call, query parameters on GETs, JSON under `body` on POSTs (the executor's OpenAPI convention). ManyChat answers OAuth discovery probes 404. The definition's base URL overrides the committed document's so self-host can point elsewhere.

### Curated ManyChat document

Pinned by `src/integrations/custom/curated-manychat.test.ts`. The committed OpenAPI document (`scripts/gen-manychat-openapi.mjs`) is compiled offline through the real executor, read from the app tree where it lives, so a regenerated document that loses readable tool names or its declared bearer method fails here.

### Curated entries

Lives in `src/integrations/custom/curated.ts` and `curated-entries.ts`. Hand-curated MCP servers or committed OpenAPI documents the frontend's curated dialog materializes through the custom stack. Slugs must stay in lockstep with `app/src/components/integrations/curated-entries.ts`. Descriptions are English (the agent answers in the user's language); keywords include Spanish and Portuguese terms. Aliases resolve as explicit scopes by exact normalized match only, before installed definitions are scoped, so an alias still resolves after the app is added. An alias and the real name collapse to one row. ManyChat's aliases include Composio's empty `many_chat` toolkit slug.

### Source detection

Lives in `src/integrations/custom/detect.ts` and `oauth-discovery.ts`. A URL is classified as OpenAPI, else probed as MCP, else `unknown` (a result, never a throw). `requiresOAuth` means the server wants its own sign-in, so a pasted key would never work; `oauthSupported` says whether this deployment can run it. The executor only guesses well-known paths and reads a non-404 there as "no OAuth"; a gateway that answers every unknown path with 401 (Supabase Edge Functions) made such servers read as needing a key, which the agent asked for in a loop. So `advertisesOAuth` runs the sign-in flow's own discovery, which also requests the endpoint for its RFC 9728 `WWW-Authenticate` resource metadata hint (cancelling any SSE body), after the well-known paths. A discovery failure means not OAuth.

### Custom integration executor host

Lives in `src/integrations/custom/executor-host.ts` (`CustomExecutorHost`).

Imports use the `/core` subpaths: the packages' root type entries are missing from the published dist, and the promise-surface `createExecutor` promisifies core plugins itself.

The executor is an in-memory compiled view; Houston's definition and secret files are the only durable state. It is built lazily and rehydrated from definitions. A definition that fails to compile degrades to `error` for itself only and is retried on the next rebuild. A failed build is dropped so the next call retries.

Mid-call elicitation is `accept-all` (no UI channel). The HTTP client layer is owned (`fetch-guard.ts`) instead of inheriting process-global fetch state. Connections are org-owned singletons named `default`.

URL-sourced OpenAPI specs are re-verified in the background after `SPEC_REFRESH_TTL_MS` (6 hours), since the view can live for weeks on a desktop. Blob specs are frozen (agent-authored) and MCP tools are discovered live. Only a changed sha256 triggers a recompile of that definition; an unreachable spec host keeps the working view; a first sighting records a baseline. The window is claimed up front so refreshes never stack, and a failed sweep is logged and waits for the next TTL.

`compileDef` never throws; a failure is a state. A keyed MCP server defaults to `Authorization: Bearer <token>` placement (the MCP scheme), also for OAuth mode, where the credential provider serves the current token per request. Collectible auth is ensured before the pending or connect fork.

`connectedState`: `mcp.addServer` only records config, so a zero-tool MCP definition gets a live probe. An auth wall indicts the credential (the executor's tool sync turns a 401 into an empty catalog): a rejected credential lands `pending`, an uncheckable one `error`. An auth wall on a definition added without a credential is reported, not shown as zero tools. The OAuth verdict is left to the sign-in flow's own discovery (as `detect.ts` judges).

`credentialVerdict` resolves each secret to the value a request would carry and runs the service's validation probe: `rejected` means re-enter or sign in; `unavailable` (store or probe unreachable) is never read as a bad credential.

`ensureCollectibleAuth`: a spec that models its key as a plain header parameter, or declares no auth, would dead-end the secure credential save. A stable `houston_fallback` method is synthesized from the spec's api-key-shaped parameter (else `Authorization: Bearer`) and re-injected on every rebuild before stored connections are recreated, so they reconnect across restarts.

### Fallback auth template

Lives in `src/integrations/custom/fallback-auth.ts` (`fallbackAuthTemplate`). For a spec declaring no auth scheme, the key's placement comes from the spec's own api-key-shaped parameters, else a safe default.

`FALLBACK_AUTH_SLUG` (`houston_fallback`) is persisted as the credential template, so every rebuild re-injects the same slug. Key names are compared with separators and a leading `x` stripped (`X-API-Key` to `apikey`). Parameters are collected in document order (components, shared, per operation), resolving `#/components/parameters` refs. Hint priority: an api-key header, then `Authorization`, then an api-key query parameter; YAML and URL specs give none. An `Authorization` placement gets the `Bearer ` prefix.

### Executor fetch guard

Lives in `src/integrations/custom/fetch-guard.ts`. The process fetch pipeline (pi installs npm undici 8.5 over Node's bundled copy) adds its own `content-length` next to the one Effect sets, and the duplicated value is rejected client-side as `UND_ERR_INVALID_ARG`, so every executor POST failed. The guard strips the explicit header for both `(url, init)` and `Request` inputs and is wired as the executor's `httpClientLayer`. Tests run against npm undici directly, because Node 22's bundled undici silently strips the header and would pass vacuously.

Effect sets an explicit `content-length` on sized bodies; with several fetch implementations live, the pipeline adds a second copy and undici v8 rejects the merged value, so only writes failed. The guard strips framing and hop-by-hop headers so every implementation computes them itself. `globalThis.fetch` is resolved at call time because pi swaps the global after boot.

### Icons

Lives in `src/integrations/custom/icon.ts` (`iconUrlOf`, `faviconDomain`). Derived at view time and never persisted, so replacements re-derive it and nothing needs migrating. The favicon service is the one the Composio catalog fallback uses (`app-display.ts`); the client's letter avatar is the fallback. The brand host is the declared website first, then the MCP endpoint, base URL, spec URL or a blob spec's first server. One technical prefix (`www`, `api`, `mcp`, …) is stripped. IP addresses, single-label hosts and private suffixes get no icon, since the lookup would disclose an internal hostname. A declared website is fetched as `/favicon.ico` directly, since the favicon service may not have indexed it.

### Legacy secret custody migration

Lives in `src/integrations/custom/legacy-custody.ts` (`moveLegacyToCustody`). Shared by a managed pod's boot and a pool worker's store migration (`op-migrate-custody.ts`). A value custody already holds always stays, since pool ops may have written custody while the plaintext file sat in the store. Each absent secret is created, decided by the gateway under the secret's lock, never from a possibly lagging read; a refused create counts only once a read finds the value. Answers: created, exists (412), or unsupported (405 from an older gateway). The plaintext file goes only when custody holds every value.

### Custom integration manager

Lives in `src/integrations/custom/manager.ts` (`CustomIntegrationManager`).

A definition that can never compile is never persisted.

A pending card always offers a real field (the synthesized method naming the spec's own key header).

Definitions recompile to the same shape after a restart with no user action.

The tools list agrees with the row's action count and never includes the executor's internal toolbox. It is an array, possibly empty, even before the key is saved.

Replace: a grown spec on the same origin keeps the stored credential and is active at once. A spec whose servers moved to another origin drops the credential and waits for a fresh one. A replay with `auth: "none"` on an unchanged service keeps the working key (the caller is a model re-deriving `auth` each call). If the carried credential's template no longer exists and the connection fails after the new spec registered, the old definition is restored, stored and connected; if the engine re-derives the template, the replacement must be fully persisted and compiled. Operations on one slug are queued in call order.

Every mutation persists first (definitions are the durable truth), then updates the executor, then notifies. Mutations run one at a time because each spans definitions, secrets, the executor and the state map; reads stay concurrent. OAuth: the callback URL is absent where the redirect cannot be received, and an OAuth wall is reported as actionable only where the sign-in can run. Pending sign-ins are held in memory and counted (a host that stops loses them). Gateway-completed attempts are serialized like local ones. Tokens and definitions become durable only at completion.

### Token bundle compare-and-set

Pinned by `src/integrations/custom/oauth-bundle.test.ts`. A refresh writes the new bundle only while the stored value is still the one it refreshed; a newer grant or a delete wins.

### Custom integration OAuth

Lives in `src/integrations/custom/oauth-flow.ts`. Houston is the OAuth client (RFC 9728 and 8414 discovery, RFC 7591 registration, PKCE); the executor only sees the access token. One pending attempt per integration; `state` is random, single-use and expiring. The completion re-checks the endpoint so a replace that moved the slug mid-flow never receives the old service's tokens. An existing client is reused when it still names the redirect URI. On managed pods `statePrefix` (`<orgSlug>.<agentSlug>`) rides inside the state so the gateway's public callback can route statelessly. All HTTP uses `guardedFetch`, because pi's patched global fetch once broke message framing. The discovered `authorization_endpoint` comes from the remote server and is opened by the OS, so only https (or http to loopback) is allowed; a `file:` or custom scheme would launch an arbitrary handler. Discovery does not treat the SDK's guessed `/authorize` for a wall with no metadata as OAuth; that is a plain bearer wall.

Lives in `src/routes/custom-integrations-oauth.ts`. The browser lands here after the consent screen with no bearer, so the route mounts before `principal(...)` and the single-use, expiring `state` is its whole authentication. It answers a small page telling the user to return; the app learns the outcome from `CustomIntegrationsChanged`. A denied consent or malformed redirect grants nothing.

Lives in `src/integrations/custom/oauth-ops.ts`. Completion stores the token bundle under the same secret id a pasted key uses and rewires through the `setCredential` sequence. Reading a previous bundle at start is only an optimization (client reuse), so a custody failure there registers fresh; completion fails loudly if tokens cannot be stored. The attempt is bound to the service endpoint, not just the slug. The post-sign-in state uses the same zero-tool judge as compile.

### Custom integration provider

Lives in `src/integrations/custom/provider.ts` (`CustomIntegrationProvider`).

Key-free and ready even signed out: definitions and secrets live on this host. `userId` is unused, since the host's disk is the single user's space and a managed pod belongs to one user. Setup happens in chat, never by OAuth redirect from `connect`. Disconnect is full removal through the manager.

Action addresses are `tools.<integration>.<owner>.<connection>.<tool>`.

`EXECUTE_TIMEOUT_MS` (120 seconds) caps one action, because a stalled call once held a workspace lock for hours.

Search fetches each matched action's schema, since the listing carries none (`tool-params.ts`).

`describeExecuteError` walks the `cause` chain (transport failures surface only "HTTP request failed" at the top) so failures self-describe. undici retries idempotent GETs on a fresh connection but never a POST, so against an edge that idle-closes connections writes fail while reads work; on that dropped-connection shape the message adds recovery guidance and leaves the decision to repeat to the model; the host never replays writes.

`unwrapExecutorResult`: the executor resolves failures as `{ok: false}` rather than throwing, so they are mapped onto the port's result and successes unwrapped. A rejected credential (including an MCP `mcp_tool_error` read by `auth-failure.ts`) points the model at the secure key-entry hand-off instead of the executor's own recovery text, which names tools this runtime lacks.

### Custom tool search

Lives in `src/integrations/custom/search.ts` (`searchCustomTools`). Token hits on a tool weigh 1 and hits on the owning app's slug or name weigh 2 (users usually name the app). Every result is connected, because a custom tool that compiled is the connection. An explicit scope is a hard filter with the same rules as the Composio resolver (`scope-resolve.ts`: exact first, loose both-way substring with a length guard only on the loose tier, no scope across two unrelated integrations), and a named app with no scoring tool still surfaces its tools and its slug. Curated entries (`curated.ts`) are discoverable as connectable rows before the user adds them; an explicit scope naming an alias resolves to the canonical slug (including Composio-style spellings like `many_chat`), never stolen by an unrelated installed name or a loose substring of the canonical slug; once added, the compiled definition speaks for itself.

Pending or errored definitions surface as not connected so the model offers the connect hand-off. Scope precedence: an installed definition named exactly, then a curated alias (whether or not added), then loose rules; a curated scope for a not-yet-added app resolves to its connectable row rather than `unresolved`, which would trigger the unscoped retry. A resolved scope always yields at least one row.

### Custom integration secrets

Lives in `src/integrations/custom/secrets.ts`.

A port so each deployment picks custody. Values never enter definitions, events, logs or the runtime; execution resolves them host-side when building the request.

`FileCustomSecretStore` (local and self-host): one JSON object, atomic temp and rename, owner-only. A corrupt file throws, since a vanished credential must surface rather than read as not connected. On POSIX the 0600 mode is the protection and is re-asserted after every write. On Windows files inherit user-scoped NTFS ACLs and there is no POSIX mode, so the write path does not rely on chmod for protection; it clears a read-only attribute on the destination first, because rename-replace over a read-only file fails `EPERM` (backup and antivirus tools set it).

`RemoteCustomSecretStore` (managed cloud): values resolve lazily through the host's scoped gateway route; the pod has no Secret Manager identity. Reads are cached in memory (60 seconds) because the executor's provider calls `has` and `get` per request; the cache is write-through since the host is the only writer. `migrateLegacy` moves pre-custody values after hydration, never replacing a held value, and removes the plaintext file only once custody holds all of them; the creates skip `set`, so cached absences are dropped.

The executor credential provider (`houston` key) resolves secrets by id at request time and never copies them. A stored token bundle resolves to its current access token (refreshed and persisted first when near expiry), so rotation needs no rewire; plain keys pass through. `resolveCredentialValue` is shared with the compile-time health check so both judge the same value.

### Service origin guard

Lives in `src/integrations/custom/service-origins.ts` (`sameServiceOrigins`). A replacement keeps the stored key only when it provably talks to the same service; otherwise a spec with `servers[].url` pointing elsewhere would receive the user's key on the next action. Adding an origin counts as a change. Indeterminate cases (unparseable spec, relative servers, a source-kind change) count as changed; the replacement lands pending and the key is re-collected through the secure card. A `baseUrl` override wins over the spec's servers. URL-sourced specs compare by document URL.

### Custom integration definitions store

Lives in `src/integrations/custom/store.ts`. Definitions carry secret ids only. The file sits beside the host's credentials file (user-level, not per agent). Atomic temp and rename; a missing file reads empty, a corrupt one throws so integrations never silently vanish.

### Executor tool params

Pinned by `src/integrations/custom/tool-params.test.ts`. The executor's tool listing has no input schemas, so every action row is hydrated from `tools.schema(address)`.

Lives in `src/integrations/custom/tool-params.ts` (`attachToolParams`). `executor.tools.list()` returns no input schema, so a match built from it shows the model an action with no parameters (in chat it guesses; a routine told never to invent parameters fails). Every action row is hydrated from `tools.schema(address)`, in parallel, at most one call per match. App rows have none; an existing schema is kept; a null view leaves the row. The executor hoists shared component schemas into `schemaDefinitions`, which are re-attached as `$defs`, because the model cannot expand a dangling `$ref`.

### Custom integration types

Lives in `src/integrations/custom/types.ts`.

User-added API and MCP sources compiled by `@executor-js`; Houston owns definitions and secrets, so no pre-1.0 executor storage schema becomes a Houston format.

A spec is a re-fetchable URL or an inline body that never needs the network.

`CustomAuthMode`: `none` connects at once; `credential` waits for the user's secret; `oauth` (MCP only) waits for the service's browser sign-in and stores a token bundle reference. Decided at add time and persisted so a restart recreates the same connection.

`slug` is both the executor catalog slug and the Houston toolkit slug; `CUSTOM_SLUG` enforces the intersection of both charsets.

`website` is the brand domain for the icon only, never part of origin checks. Static `headers` are non-secret.

`verified` on a credential save is advisory: `false` means the probe was rejected but the key still saved (the placement guess may not fit), so the UI warns rather than blocks; absent means no probe.

`CustomIntegrationError` carries a `code` routes map to stable bodies.

### Smaller rules

`edit-details.ts`: cosmetic edits never replace the connection or its stable tool and credential ids.

`views.ts`: the display URL is the spec URL or MCP endpoint; blob specs have none.

`oauth-attempts.ts`: pending attempts are in memory (a restart only means pressing Sign in again). A new start invalidates the integration's previous attempt, so one authorize URL can land per integration. A state is consumed by its first take, valid or not.

`auth-methods.ts`: one secret input per method under the executor's canonical `token` variable. Only secret-input methods are offered; OAuth needs the browser flow.

`tools.ts`: the executor's internal tools live under the reserved `executor` integration, so a plain slug filter excludes them.

`slug.ts`: user names become slugs valid for both executor catalogs and Houston grants (`CUSTOM_SLUG`).

## Turns, files and uploads

### Turn bus contract

Lives in `src/testing/turn-bus-contract.ts`. Every adapter must agree on pub/sub fan-out and unsubscribe (per-channel publish order), key set, get and delete with TTL, the `setNx` mutex with lease renewal through `expire`, and atomic counters taking their TTL at creation. Parameterized by `make(now)` so virtual-clock adapters prove expiry deterministically; adapters without an injectable clock run the time assertions on native TTL semantics.

### Composer attachments

Lives in `src/turn/attachments.ts` (`saveAttachments`). Uploads land in a visible top-level `uploads/` folder: the runtime's clamped file tools read them at the returned relative path, the Files tab lists them, and nothing deletes them, so an upload stays referenceable from later conversations. Name collisions disambiguate; a folder attached again merges, with files inside disambiguating. Path rules match the Files tab and a batch is atomic. Legacy clients still send `scopeId`, which is accepted and ignored. Uploads emit `FilesChanged`.

Storage is `<agentRoot>/uploads/<filename>` where `agentRoot` is `HOUSTON_WORKSPACE_DIR`, the runtime's clamp root, so the returned relative path is exactly what the agent's Read tool opens and what the frontend writes into the message. Files stored under the old hidden `.attachments/<scopeId>/` layout stay readable; nothing new lands there. Small files ride base64 JSON; larger ones reference a staged upload. The legacy per-scope DELETE is gone: old clients get a 405 and ignore it, and nothing they send can remove an upload.

### Turn bus

Lives in `src/turn/bus.ts` (`TurnBus`). The port that makes the Cloud Run path replica-safe: relay fan-out and snapshots, the one-turn-per-agent gate, quota counters and connect state all use it. `MemoryTurnBus` is the open adapter and keeps single-replica semantics with synchronous fan-out, lazy TTL expiry and counters that take their TTL on creation. A multi-replica adapter lives outside this repo and must pass the shared contract (`testing/turn-bus-contract.ts`). Per-channel delivery keeps publish order. `setNx` is the cross-replica mutex, `expire` the lease heartbeat, `incr` sets the TTL on create.

### Cloud provider resolution

Lives in `src/turn/cloud-provider.ts` (`resolveCloudTurn`, `hasCustomEndpoint`). Never silently substitutes a provider (the wrong model and the wrong cost accounting). Precedence: a routine's pin, then the agent's saved active provider, then Codex. An unservable pin throws visibly and is checked before any dependency is touched (only openai-compatible needs the endpoint lookup). A saved openai-compatible without an endpoint throws. Only a stale non-cloud saved pick (Anthropic, off in cloud) falls back to Codex. openai-compatible is `cloud: false` in the catalog to stay out of the curated picker, so its eligibility is decided by whether base URL and model are persisted (the runtime's `customEndpointConfigured` test). Pins apply per turn and never touch settings. Refusal text uses the catalog name, since the reader is the person who set up the routine.

### Codex device-code connect

Lives in `src/turn/connect.ts`. Per-turn runtimes are stateless, so the device-code flow lives in the control plane using pi's own openai-codex OAuth (same client and rotation semantics as the desktop). The credential lands directly in the central store; no refresh token touches an agent. Every transition is mirrored to the TurnBus (state TTL 30 minutes) and one replica owns the poll loop via `setNx`; others return the in-progress device code. The provider flow is driven directly instead of `ModelRuntime.login`, which writes a temporary `auth.json` and follows success with a network catalog refresh that could hold the lock indefinitely. The poll is bounded by `AbortSignal.timeout` (pi 0.84 and later require a signal). Headless: only the device-code path; any other prompt type fails loudly. A failed bus mirror is reported, and the local flow still completes.

### Turn deps

Lives in `src/turn/deps.ts`. `idToken` is the Google ID token for Cloud Run IAM, null in dev. `methodNotAllowed` and `readJson` are re-exported from routes so the turn path shares the chain's 405 body and byte cap. `customEndpointKey` is the same path and schema the runtime reads.

### Cloud Run turn dispatch

Lives in `src/turn/dispatch.ts`, `start-turn.ts` (`dispatchTurn`, `startTurn`).

A turn POST claims the workspace quota and the per-agent relay slot, carries a refreshed short-lived access credential (never the refresh token; the refreshed credential is persisted centrally), and pumps the runtime's SSE frames into the relay. Reads serve straight from object storage.

The provider and effort resolve before claiming anything, so an unservable pin fails visibly and leaks no slot; `resolveCloudTurn` never substitutes Codex for the user's pick, the routine's pin beats the agent's saved provider, and neither writes settings.

The transport-free core returns an outcome so the user-message route and the routine firer share one path. Capture into the turn log is independent of client subscriptions.

Optional body fields are omitted when absent so single-player bodies stay identical: model, effort, mode, `displayText` (presentation only), mentions, `missionTitle` (first send of a new mission). The credential's non-secret `enterpriseUrl` rides along.

Frames are awaited into the relay one at a time to keep order; the relay stamps seq.

A re-send with the same conversation and nonce as the running turn is a lost-response retry and answers 202 like the original.

Bodies that fail to parse are a 400 (whether streamed or pre-read by the attribution route); an over-cap body is a 413.

`Last-Event-ID` wins over `?after=`, because the gateway advances the header past its Redis replay while the query stays.

Cancel with no turn in flight answers `cancelled: false`, which clients use to settle a card left running after a restart; a live cancel answers `cancelled: true` and leaves status to the turn's terminal frame.

Lives in `src/turn/dispatch.ts` (`dispatchCloudrun`). Serves the same `/agents/:id/*` surface the standing proxy serves, so the web client cannot tell: turns are one internal POST to the runtime through the relay, reads come from object storage, connect runs in the control plane. `files*` never reaches here; the host intercepts it for every profile. A pre-read body is parsed in place of the exhausted stream. Mentions are sanitized with the shared guard the runtime re-applies. Providers, settings and auth go to `dispatch-providers.ts`, where connected providers come from the central store (active is the saved one if still connected, else the first), only OAuth providers have device-code login state, and OAuth sign-in is Codex-only in cloud (Anthropic's terms do not allow it); API-key gateways connect through the credential route.

### Conversation events route

Pinned by `src/turn/events-route.test.ts`. The same resume contract as the runtime's route (shared stitch), plus the dead-pump reaper before the sync is built, so a crashed pump never leaves a spinner.

Lives in `src/turn/events-route.ts` (`serveConversationEvents`). The host twin of the runtime's resumable stream (`packages/runtime/src/transport/events-route.ts`) through the shared `serveResumableStream`: fresh connect gets a sync then live frames, a serviceable cursor gets gap-free replay, anything else a resync. The reaper runs first. The close handler is registered before the async reads, and a hang-up during the reads releases the subscription at once.

### Files tab

Lives in `src/turn/files*.ts` (`handleFiles` and the pure ops in `files-ops.ts`, `files-import.ts`, `files-archive.ts`).

The host serves the Files tab for every profile off the shared vfs, over the agent's workspace root (cloud `<prefix>/workspace`, local `<Workspace>/<Agent>`), intercepted before the runtime (which has no files route). Every `files*` path is owned, so an unknown one is a 404, never forwarded.

`.houston/` and `.agents/` are hidden and refused by every op. Every model- or UI-supplied path is validated to stay inside the root (no `..`, no absolute, no top-level dot-directory). The `.keep` folder marker is hidden.

Folders are synthesized in listings, sort first, and take the oldest creation and newest modification beneath them. Overwrites keep the original creation time. Non-UTF-8 text reads as binary; downloads come back byte for byte.

A rename or move onto an existing name is a 409 with a code, because POSIX `rename(2)` overwrites silently. Case and Unicode folding are judged by the volume itself, through the adapter's `exists` and `keyCase` probe: `toLowerCase()` is not APFS's fold table (`STRASSE.txt` opens `straße.txt`) and macOS stores names decomposed while browsers send composed. A destination that resolves to the source inode is the same file, so a re-spelling is allowed. The key set is only a pre-check; the store enforces. The listing returns what `readdir` said (NFD on macOS) while agents send composed names, so the key set normalizes for lookups. A source deleted elsewhere is the user's state, answered with a typed status.

Deletes use recursive removal (directories) and never walk a plain file as a prefix (ENOTDIR).

Uploads never overwrite, stay inside the root, never touch dot-directories, cap path depth, and are atomic per batch (an invalid entry means nothing is written). Moves keep names and take folders whole.

A rename to the same name emits nothing. Every other mutation emits `FilesChanged`.

Storage that refuses every write (read-only mount, revoked permissions) raises a typed refusal from whichever op hits it first, named once in the handler as 403 `read_only` with a code, because clients tell expected refusals from bugs by code (`app/src/lib/file-conflicts.ts`).

A 404 for a file logs why (path stripped, sibling roots, no `FilesChanged` seen).

### Archive

Lives in `src/turn/files-archive.ts`. Same visibility rules as the listing: what the Files tab shows is what the zip holds. Used for "Download all" and per-folder download where no local OS can reveal the folder. Store-only (level 0), since agent deliverables are already compressed and a predictable fast pass beats compressing on the event loop. `MAX_ARCHIVE_BYTES` is 256 MiB. Mtimes outside zip's 1980 to 2099 range are omitted. A folder becomes the archive's root entry, as Finder does. Files deleted mid-archive are skipped.

### Binary file reads

Lives in `src/turn/files-binary.ts` (`serveFileDownload`, `serveArchive`). They write their own head and body, so they sit apart from the JSON route surface. Sources are read on every request; Office previews cache only converted bytes, keyed by source content so a rewrite never serves a stale PDF. Downloads accept absolute paths via `workspaceRel`.

### Upload limits and folder uploads

Lives in `src/turn/files-import.ts` and `attachments-save.ts`.

`MAX_UPLOAD_BYTES` (100 MiB) matches the composer's client limit (`app/src/lib/attachment-validation.ts`), so a file the UI accepts is never rejected. `MAX_UPLOAD_BODY_BYTES` bounds the raw body at the base64-inflated size plus 1 MiB of JSON envelope, so a legitimate upload is never cut while an oversized one is stopped during draining; the decoded check is the limit shown to users.

Folder uploads carry `relPath` (like `File.webkitRelativePath`) with at least two segments (a single segment must arrive as `name`), at most 32, each held to the filename rules. Hosts without folder support store the flat name.

Files never overwrite: collisions get " (n)" before the extension, judged the storage's way (case-folding disks, then the volume's own answer). Directories merge, because a folder arrives over several size-batched requests. Attachments seed the dedupe set with everything already under `uploads/`, since uploads are durable across conversations.

Validation is lexical; the vfs write resolves symlinks. A symlinked directory under `uploads/` could redirect a write, but only something that already writes the workspace (the agent) can plant one, and it can already write wherever that would point.

### Files listing

Lives in `src/turn/files-list.ts` (`listWorkspace`). Returns the desktop `ProjectFile` shape with synthesized folder rows, folders first. `.keep` markers are hidden but surface their folder; top-level dot-directories are hidden whole.

### File MIME and disposition

Lives in `src/turn/files-mime.ts`. MIME types cover the deliverables agents produce. `Content-Disposition` follows RFC 6266 with an ASCII fallback and a UTF-8 `filename*`.

### Missing file log

Lives in `src/turn/files-missing.ts` (`logMissingFile`). The frontend treats file-not-found as the user's state and no longer reports it, so the host logs one line telling the cases apart: parent folder absent, siblings present without the name (rename or delete), or a `FilesChanged` seconds earlier (a write racing the click). The clock is fed by every event the host emits; runtime-relayed events that do not pass through the hub show as none seen. Logging never turns the 404 into a 500.

### Moves

Lives in `src/turn/files-move.ts` (`moveWorkspaceEntry`). Keeps the name, refuses a clobber (409) and moving a folder into itself. A move into the folder it is already in (spelled differently) is a no-op. Folders move child by child, so the storage is asked whether the destination exists before the first child lands, or a destination the volume folds to the same name would silently merge. The empty source tree is swept afterwards.

### Workspace key set

Lives in `src/turn/files-names.ts` (`WorkspaceKeys`, `loadWorkspaceKeys`, `readOnlyRefusal`, `moveOrRefuse`). The cheap pre-check before any bytes move, carrying the backend's `KeyCase` so no call site can forget it: on macOS and Windows `readme.md` and `README.md` are one object. On normalizing volumes keys compare NFC. `taken` also matches directory prefixes, since object-store directories have no key. `sameSlot` treats a case-only rename on a folded disk as a real rename. `Vfs.move` has the last word (`VfsExistsError`) and `moveOrRefuse` turns it into the same user sentence. `VfsReadOnlyError` from any write primitive maps to one refusal at the route (`app/src/lib/read-only-toast.ts`).

### Office previews

Lives in `src/turn/files-office.ts` and `office-converter.ts`. Refusals answer a fixed sentence per code; thrown detail stays in logs. The service's refusals carry no sentence, so the host owns the message. The cache key uses the converter version returned with the conversion, since a deployment can change revision between health probe and conversion.

### Files ops internals

Lives in `src/turn/files-ops.ts`. Layout-blind. Reads accept absolute paths via `workspaceRel` because agents link files by absolute path. A directory delete is a recursive prefix delete, since deleting children cannot remove the directory node. Empty folders exist only through a `.keep` marker; creating one where a file holds the name is refused.

### Absolute path strip

Lives in `src/turn/files-path.ts` (`workspaceRel`). Agents put their own absolute working-directory paths in chat links (`/data/workspaces/W/A/x.md` on pods); cloud clients cannot strip them (the agent key is opaque), so the host does, keyed on `<Workspace>/<Agent>`, including Windows drives with a leading slash from markdown href normalization.

Absolute paths are rejected rather than clamped, and top-level dot-directories are refused. `workspaceRel` accepts the absolute paths agents put in prose (`/data/workspaces/W/A/x.md`, `C:\Users\...\workspaces\W\A\x.md`) by stripping up to the first `/<root>/`, since the runtime's working directory is `<fsRoot>/<root>`; anything else falls to strict validation. `FileOpError` carries a shared `FileOpCode` beside the status, because a second 409 on a route would otherwise inherit the first one's copy.

### Files routes and attachments route

Lives in `src/turn/files-routes.ts` and `attachments-routes.ts`. Declarations only, because the handlers are at the file-size cap. The Files family owns every `files*` path for every method. The attachments route answers DELETE with 405, which old clients fire when a chat is cleared and ignore; a fall-through would proxy it to the runtime.

### Frame forwarder

Pinned by `src/turn/frame-forwarder.test.ts`. Ingest is a bare array of `{seq, frame}` with the frame verbatim, so replayed frames are byte-identical to live ones. Capture is unconditional, independent of SSE subscribers.

Lives in `src/turn/frame-forwarder.ts` and `standing-frame-capture.ts`. The forwarder batches relay frames into the event log even with no SSE client; captures idle out after 30 minutes. The standing capture pumps a standing runtime's SSE into the log without a client, skips the initial `sync` frame, and publishes the runtime ReplayLog's own seq, never a second counter.

### Per-turn credential

Lives in `src/turn/fresh-credential.ts` (`freshCredential`). The per-turn credential refreshes through the same process-wide coalescer the serve route uses, because a second rotator would race it and the loser's `invalid_grant` disconnects the user. API keys are served as-is. A disconnect mid-flight reads as no credential.

### Turn runtime ID token

Lives in `src/turn/id-token.ts`. Google-signed ID tokens from the metadata server call the IAM-gated turn runtime (Workload Identity on GKE), cached and refreshed 5 minutes before expiry. With no metadata server (dev), only the app-layer `X-Internal-Token` is sent and Cloud Run IAM enforces server-side.

### Office cache pruning

Lives in `src/turn/office-cache.ts`. Only completed entries and abandoned temp files are pruned.

### BYO endpoint dispatch

Pinned by `src/turn/openai-compatible-dispatch.test.ts`. A configured openai-compatible endpoint must dispatch with its served API-key credential (the credential's provider proves which provider ran); a saved openai-compatible provider with no endpoint dispatches nothing, rather than substituting Codex.

### Turn quota

Lives in `src/turn/quota.ts`. A per-workspace concurrent cap plus an hourly count so one workspace cannot hog the turn runtime fleet, on the TurnBus so it holds across replicas. The hourly window is a fixed UTC-hour bucket (the bus has atomic counters, not sorted sets; precise enough for a usage cap). The concurrent counter's TTL only guards leaks. Rejected attempts do not spend the hourly budget. Release is idempotent.

### Relay channels

Lives in `src/turn/relay-channel.ts` (`RelayChannels`). Owns what a conversation's stream is (the relay owns when it opens and closes), using the shared `StreamChannel` from `@houston/runtime-client` with the runtime bus's append, reduce, fan out, clear-on-terminal order. The relay is the only sequencing authority; upstream seqs are never trusted. Opening seeds the counter from the persisted watermark so seq continues across replicas; a publish outside a started turn seeds the same way, re-checking after the await so a live counter is never clobbered. Persist and broadcast run in parallel (subscribers stitch by seq and the snapshot is read on connect). The snapshot is always persisted, idle included, so the watermark outlives the turn. Only the replay buffer is replica-local. A healed dead turn's synthesized frame is kept per conversation and served only to a cursor parked at the dead turn's watermark; the heal re-reads and requires the same running turn id, and drops the local channel afterwards so later turns elsewhere are not shadowed.

### Relay bus dialect

Lives in `src/turn/relay-dialect.ts`. Channel and key names are versioned (`turn:ev2:`, `turn:snap2:`) because payload shapes changed when sequencing moved into the envelope; during a rolling deploy old replicas keep v1 among themselves and stale v1 keys age out. Bump the suffix whenever the payload shape changes. Additive fields (the running turn's thinking and activity) need no bump; an old replica drops them. `parseSnapshot` reads anything malformed or foreign as empty, which routes surface as a resync. `SNAP_TTL_SEC` (1 hour) bounds the snapshot's life after a turn; an older cursor resyncs anyway.

### Relay pump and lease

Lives in `src/turn/relay-pump.ts` (`pumpTurn`) and `relay-lease.ts`. A user stop publishes the same verbatim string the runtime emits, so the web adapter renders both as a neutral stop. Terminal frames carry the id of the turn they end. The inflight lease is 90 seconds: long enough for GC pauses, short enough that a crashed replica frees its agents in about a minute. A failed heartbeat is logged at error level, since losing the lease allows a double start; a failed release is logged and the TTL frees the slot.

### Turn relay

Lives in `src/turn/relay.ts` (`TurnRelay`) and `relay-channel.ts`.

Preserves the web client's subscribe-then-send contract over the runtime's single-request turn stream, with the runtime bus's sequencing and snapshot semantics (shared ReplayLog and reducer). One turn per agent, because the runtime syncs whole-agent state.

Replica-safe through the TurnBus: the inflight gate is a bus mutex with a heartbeat lease whose value is the conversation key, frames broadcast on a bus channel, cancel is a bus message the owner acts on, and the snapshot with its seq watermark is a bus key. Seq is stamped by the relay alone and stays monotonic across turns and replicas; duplicate upstream seqs are re-stamped, never re-broadcast.

Replay windows serve `?after=` resumes; a finished turn clears the window and keeps the watermark; a cursor too old, or a buffer on another replica, gets a resync.

A throw from the pump is published as an error frame (an abort reads as cancelled). A pump ending with the conversation still running gets a synthesized error at watermark plus one, so no client hangs.

`reapIfDead` runs at subscribe time: running with no lease means the owner died (start creates the lease before any frame flips the snapshot). The heal re-reads and requires the same turn id, concurrent connects share one heal, and the synthesized terminal carries the dead turn's id.

Cancel with a conversation key aborts only a turn on that conversation, since chats and routines share the slot.

`duplicateSend`: the in-flight entry records the send nonce, so a retry of the accepted send reads as accepted rather than busy.

### Turn log ingest

Lives in `src/turn/turn-log-http.ts`. A bare array of `{seq, frame}` with the full frame verbatim, so replays are byte-identical to live frames.

### Upload staging

Lives in `src/uploads/local.ts` (`LocalUploadSessions`). Staging lives outside the workspace and never enters its listing or sync. One writer per session; a retry sees only bytes its predecessor closed. A dropped connection is an expected state.

### Upload sink

Lives in `src/uploads/sink.ts`. Pipeline backpressure bounds memory regardless of request size. An oversized body truncates the part file back to where it started. Bytes that landed stay for the client's status query. A final sync joins an upload copy's transaction before walking the new file.

### Smaller rules

`src/uploads/parse-files.ts`: the raw body is capped during draining (the memory guard); the decoded-size estimate from base64 length is the user-facing limit.

## Runtime channels

### Runtime credential capture

Lives in `src/channel/capture-credential.ts` (`captureRuntimeCredential`) and `scrub-refresh.ts`.

Store the runtime's credential centrally, then remove its refresh token, scoped end to end by `actingAs` (export as the member, write the member's row, scrub the member's file). The scrub names the captured provider, because an unscoped scrub erased every provider's refresh token and two concurrent connects could leave one access-only centrally.

Settlement is idempotent: a replay after an ambiguous response finds nothing exportable (a scrubbed entry exports as `{}`) and settles against the central store; with no central row it answers not connected. A probe failure reads as not settled.

After the central PUT lands, a failed scrub settles as success with a loud error; the runtime's serve sync finishes the scrub (`auth/capture-settlement.ts`). Failing it made clients replay a tombstone-clearing PUT while the pod kept rotating the family beside the gateway.

`localOriginOnly` (the healer): OAuth exports are refresh-bearing only, so serve-written projections (access-only) are excluded structurally; for API keys the flag rides to `/auth/export` as `excludeServed=1` and the runtime's served-providers manifest proves origin. That heals a pasted Anthropic setup token without re-pasting, and never resurrects a disconnected served key.

`ifAbsent` (`x-houston-if-absent`) is the maintenance contract for automatic re-pushes; only a user connect overwrites.

API keys are not scrubbed and stay in `auth.json`, since on the desktop the serve path never re-supplies Anthropic. Legacy pre-verification runtime entries are rejected so the connect flow shows the paste card. Google AI Studio keys with the `AQ.` prefix are valid; only OAuth-shaped material (`ya29.`, `eyJ`) is refused by shape. Azure's endpoint is stored beside the key.

Where Anthropic is not served (desktop, self-host), the runtime's shared login directory is its single holder and rotator: nothing is stored or scrubbed, a refresh-bearing entry is left as the single rotator, and the runtime's `/auth/status` settles the capture.

`RUNTIME_EXPORT_TIMEOUT_MS` is 8 seconds because the runtime's own serve probe gives up at 10; otherwise a stalled runtime held heals for undici's 300-second headers timeout.

### Runtime channel contract

Pinned by `src/channel/contract.test.ts`. Both channels must honor the common surface so the host picks one by `workspace.runtime` and never branches: capture answers not connected before a connection and the provider after; forget empties the central store; dispatch serves `/providers` with `configured` reflecting the connection; fire resolves on the happy path; teardown completes. Transport, teardown effects and capture mechanics differ per channel and are tested separately. Two operations are asymmetric: `saveCustomEndpoint` posts to the standing runtime but, on the per-turn channel, persists `<prefix>/data/custom-endpoint.json` (the key is not written there, since it lives in `auth.json`, which the per-turn runtime injects); `saveClaudeOAuthCredential` keeps the refresh token for the single-tenant pod and is refused by the multi-tenant per-turn channel. A stale snapshot on the fill-only path is a quiet no-op.

### Fire errors

Lives in `src/channel/fire-error.ts`.

`TurnFireError` carries the runtime's machine-readable `code` (for example `no_provider`) and the named provider, so the scheduler tells expected user states from failures and a routine run can say which account to reconnect. Non-JSON bodies keep the verbatim text.

`TurnBusyError` (`turn_busy`) names the conversation holding the agent-wide slot, so a caller asking whether its own turn is running never mistakes another chat's.

`isDialFailure`: only undici's dial-time codes prove the request never left. `TurnDeliveryUncertainError`: a POST that failed after the connection opened may have started a turn, so it is never redelivered (a routine that sends email would send twice). The exception is `hostShuttingDown`: the drain had already sent SIGTERM, the runtime refuses new turns and answers accepted ones with 202 at once, so an unanswered POST never started a turn.

### Next-step suggestions

Lives in `src/channel/next-step-suggestions.ts`. The host applies the person's setting to every turn it hands a runtime (chat, mission first turn, routine, briefing), because a client could only stamp its own sends. Read per turn. Only an unfronted host wires it (its preferences doc is the person's own); behind a gateway, the gateway stamps it. A client value is always replaced. Only off is stamped, since omission means on and keeps the sender's bytes; an unparseable body travels untouched. A read failure warns and runs with the default.

### Cold-boot probe wake

Lives in `src/channel/probe-wake.ts` (`wakeForDispatch`). Read-only status probes (providers, provider usage, auth status; GET, exact paths) race the wake against `PROBE_WAKE_DEADLINE_MS` (1.5 seconds) and answer 503 with `Retry-After` when the boot is slower, instead of holding the socket for the 60-second boot budget. The boot is never aborted and is single-flight per agent (`launcher/process.ts`), so the retry joins it. The launcher's `status` is not consulted, because it reports running before the child is healthy. Everything else awaits the wake. A boot failure after the answer is surfaced by the next probe. A host mid-shutdown answers 503 with the gateway's waking body (`engine unavailable` plus detail), the pair every client reads as "not there yet".

### Quiesce latch

Pinned by `src/channel/proxy-quiesce.test.ts`. Quiescing an absent runtime is a no-op success (the launcher rejects sleeping an unknown sandbox). The hold spans sleep and callback, and is released even when the callback throws.

### Proxy channel (standing runtime)

Lives in `src/channel/proxy.ts` (`ProxyChannel`).

Wakes the agent's runtime and relays requests one to one over its whole contract. `RuntimeProxy` is an interface so the channel does not depend on the forward module.

`forwardActingHeader` is true only where a trusted gateway mints and strips the header, because the runtime decodes the acting token without verifying it; on the desktop any client could otherwise set message attribution. The routine path's server-minted `x-houston-acting-user` never rides that header. The acting header is forwarded verbatim, single-value only.

First touch spins the runtime up; read-only probes answer "retry shortly" instead of holding the socket for a cold start.

Non-GET bodies pass through raw, minus the caller's `token` parameter (the user's JWT never reaches the runtime), capped at `MAX_JSON_BYTES` because files and attachments are intercepted earlier and the pod is memory-capped. A body already drained by a route is taken from the ctx.

Turn-log capture is shadow-only and can never affect a send.

`Last-Event-ID` is relayed so SSE resume survives the proxy.

Programmatic fires record the live turn (conversation and acting identity) before posting the prompt as a normal message, with pins omitted when absent; a non-2xx throws so the scheduler records an errored run. `ROUTINE_FIRE_HEADER` is set only here; `forward` builds its own header list, so no client message can carry it.

An asleep or absent runtime cannot be running a turn or hold a sign-in (sleep ends the process), so busy, cancel and login checks answer without waking it. A cancel with a non-2xx or unreadable body throws, surfacing the abort failure without resurrecting the run. A missing `loginPending` field (older runtime) means none; any value other than literal false means pending.

`quiesce` sleeps rather than destroys (pi's `continueRecent` restores sessions on respawn); the launcher's sleep waits for actual exit, escalating to SIGKILL. The hold spans sleep and the callback, because the app reconnects within about 500 ms with the old id and would otherwise spawn a runtime into the directory being renamed. Only an existing runtime is slept; renaming a never-woken agent succeeds.

Capture (user-initiated connect): pull the credential, store it for the workspace (a full PUT that supersedes tombstones, unlike the healer's fill-only path), then scrub the runtime's refresh token. A scrub failure after the store landed is a success, logged, and finished by the runtime's serve sync; failing it made clients replay the tombstone-clearing PUT. The member's own credential is read, stored and scrubbed under their scope. A successful connect clears revocation tombstones.

Forget drops the central credential, because every runtime re-pulls it before each turn.

API keys: pushed to the runtime first, which live-verifies the key (`verify-api-key.ts`), then stored centrally; storing first left bad keys connected everywhere. The typed verification reason (`invalid_key`, `key_restricted`, `provider_unavailable`) survives to the dialog. Azure's per-resource endpoint rides the row's `enterpriseUrl`, since a runtime that never ran the connect needs it. A central PUT failure rolls the runtime entry back (only if it still holds this exact key), because a key the central store never learned is absent from the served manifest and would vanish at the next recycle; a rollback failure is logged, never masking the central error. A verified key clears tombstones.

Claude subscription push: stored centrally (access and refresh; the control plane is the single refresher) and pushed to the runtime, which writes the SDK's `.credentials.json` and warms the probe. From the next serve, a managed pod uses the access-only per-turn path like every provider, and a recycled pod reconnects from the store; the file stays the fallback, outranked by the served env token. On desktop and self-host the central entry is an inert durability marker. The per-turn Cloud Run channel refuses this credential. The push is skipped for an attributed connect (the shared file is team material and a second self-refreshing holder would fork the rotator); the store put is the whole connect there, and the tombstone is cleared before that early return. Fill-only pushes do nothing when a central credential exists (its refresh token may have rotated) and are refused while a revocation tombstone stands; a probe failure throws rather than guess. An overwrite with an already-expired access token is a cached snapshot and is rejected (a fresh mint is always future-dated); missing expiry metadata passes. `STALE_SKEW_MS` (60 seconds) allows a slightly fast clock. The put also passes `ifAbsent` under the gateway's row lock. The provider id is `anthropic`; missing refresh token or expiry store cleanly. The token is never logged.

OpenAI-compatible endpoints are saved to the runtime with the acting identity, because the runtime keys its auth file by scope and saving without it wrote the team file, then the placeholder key is stored centrally (pods are stateless and the per-turn serve is the durable source). A plain PUT clears tombstones.

`anthropicServedHere` is false on desktop and self-host, where the runtime's shared login directory is the single holder (`capture-credential.ts`). `beforeTurn` is the managed shared-cache freshness gate, run only for turn starts.

### Turn timezone stamp

Lives in `src/channel/turn-timezone.ts`. Replaces client context with the scheduler zone, keeping the bytes unchanged when the field is absent.

### Per-turn channel

Lives in `src/channel/turn.ts` (`TurnChannel`) and `turn-credentials.ts`. No standing runtime: requests are served against the Cloud Run turn runtime and the object-storage prefix, and connect-once runs in the control plane, so capture only confirms the central credential (cloud serves only the subscription provider). The acting identity is recorded on the turn rather than sent to the runtime, and routine fires need no marker. Cancel is scoped to the conversation's key, since the agent's single slot may run another conversation. Anthropic is refused: a subscription credential and refresh token must never land in a shared per-turn process. Custom endpoints are written to `custom-endpoint.json` under the key and schema the runtime reads (`packages/runtime/src/ai/openai-compatible.ts`), and the key (or keyless placeholder) is stored as a central api_key credential that `freshCredential` serves each turn; the key never sits in the hydrated file. Azure's endpoint rides `enterpriseUrl`.

### Proxy forward

Pinned by `src/proxy/route.test.ts`. The proxy delivers the runtime's SSE bytes verbatim (heartbeat comment, `sync` and `text` frames) and long-lived streams, sends the agent's token, never the caller's, and maps a refused connection to an error.

Lives in `src/proxy/route.ts` (`forward`, `ProxyError`).

The control plane holds no per-agent state; every `/agents/:id/*` call is forwarded one to one under the agent's own sandbox bearer, never the caller's Supabase JWT. The gateway's acting token and `Last-Event-ID` are the only caller headers relayed.

SSE is relayed with no buffering, transform or idle timeout. Each chunk is written as it arrives with `setNoDelay`, not `pipe`, because under Bun the pipe buffered the stream and the terminal `done` frame never reached the client. Runtime SSE headers are reflected so intermediaries do not buffer. A client hangup aborts the upstream fetch (listening on both the response and request, for Node and Bun) and is a normal end.

Other responses relay status, content type and body verbatim, so runtime errors reach the caller as themselves.

Pure connection failures are retried up to five times with 0.4 to 1.6 second backoff, safe even for POSTs since nothing reached the runtime; this covers the window after a cold boot when the pod is ready but Service endpoints have not propagated. Any response ends the loop. Out of retries surfaces as 502 (or destroys the response if headers were sent) and rethrows.

### Transcript shadow reply

Lives in `src/transcripts/http-shadow.ts`. An undefined reply means the route is unavailable and the file reader is used.

### Smaller rules

`src/transcripts/reply-wire.ts` (`parseReplyAfter`): the owned gateway returns the protocol's verbatim `ChatMessage`; the fields reconcile relies on are refined and additive metadata (provider errors, attribution) survives.

## Runtime launcher

### Assistant role

Pinned by `src/launcher/assistant-role.test.ts`. The host decides the coordinator from the agent it spawns plus its own environment: locally the synthetic `.assistant`; on a managed pod an ordinarily named agent marked by the gateway, honored only on the managed profile. A blank marker is not a marker. The pod marker alone is not enough on a non-managed host, because a self-hoster who copied the assistant variables would otherwise turn every agent into a coordinator (no bash, no skills, `start_mission` refused). An ordinary agent pod configured against a gateway does not inherit the coordinator's toolset.

Lives in `src/launcher/assistant-role.ts` (`assistantRuntimeRole`). The coordinator operates Houston for the user (`houston_capabilities`, `houston_describe`, `houston_call`), hands real work to the user's agents, and gives up bash and skills in exchange, so the host decides which runtime it is. Desktop and self-host: the synthetic `.assistant`. Managed assistant pod: the gateway stamps `HOUSTON_ASSISTANT_USER_ID` into the pod, trusted only from the host's own environment and only with `HOUSTON_MANAGED_CLOUD` (the second factor `assistant-claim.ts` also requires); the host re-states the decision to its child. The raw variable is read here because the decision happens at spawn time with no deps bag. A pool worker running Houston's turn says so through the coordinator scope. The runtime is told only its role.

### Launcher contract

Pinned by `src/launcher/contract.test.ts` with the shared `testing/launcher-contract.ts`. FakeLauncher and ProcessLauncher (with injected doubles) pass the same contract, the bar for out-of-repo adapters. Deliberate divergences: FakeLauncher models running, asleep and absent (sleeping an unknown agent throws), while ProcessLauncher has only running and asleep (sleeping an unknown agent is a no-op and destroy equals sleep); endpoint values differ. Cloud Run per-turn runtimes have no launcher at all; the turn channel replaces it.

### Fake launcher

Lives in `src/launcher/fake.ts`. In-memory states for dev and tests pointing every awake sandbox at one configurable engine URL. Sleeping a destroyed or never-created sandbox throws rather than papering over the mismatch.

### Health probe

Lives in `src/launcher/process-probes.ts`. `BOOT_HEALTH_BUDGET_MS` is 60 seconds: a cold boot in a CPU-capped engine pod measures about 10.5 seconds and the old 10-second budget killed runtimes as they started listening. A runtime that dies during boot fails fast through `onExit`, so the generous budget costs nothing. Ports are allocated by binding `:0`.

### Process launcher

Lives in `src/launcher/process.ts` (`ProcessLauncher`), `process-boot.ts`, `process-drain.ts`, `process-types.ts`.

One pi-runtime subprocess per agent, the desktop analog of a pod, spawned lazily, kept warm, SIGTERM'd on sleep, and dispatched to through the same ProxyChannel: the same channel code with a different launcher.

Single-flight boot per agent: the running entry exists before the child is healthy (so sleep and shutdown can kill a booting process), so concurrent callers await the same spawn and health instead of being handed an unbound port (which surfaced as an empty chat or disconnected provider).

`hold` is a refcounted rename latch; while held, `ensureAwake` throws `AgentRenamingError`, because the app's reconnect storm arrives with the old id and a runtime spawned then would recreate the old directory. The latch is re-checked after the port-allocation await, the one window where a boot exists with no running entry.

`closed` is latched by `shutdownAll*`: the live set is cleared before children exit, and a dispatch in that window would respawn an orphan into a host whose listener is closed. A boot that entered before the sweep is refused after the port await. A boot killed by the drain fails as `LauncherClosedError` (a 503, retried elsewhere), not as a broken runtime.

A sleep mid-drain is joined by concurrent sleeps; a wake arriving mid-drain waits for it, then respawns or returns the live entry, never racing two children over one directory.

The exit reaper evicts a crashed runtime only if the map still points at that handle, and the same registration aborts a boot in flight, since the health probe cannot tell booting from dead. A death nobody asked for (entry live, no drain, no shutdown) is reported with the exit shape only the host sees (`runtime-death.ts`); `stopRequested` is set before `draining` so a stub that exits synchronously inside kill is still read as requested. A handle wired to Node's `exit` passes a code, not an exit, and reports nothing. The raced rejection is always observed. A runtime that never comes up is killed and the failure surfaced.

`drainUntilExit`: subscribe before killing, SIGTERM, escalate to SIGKILL after the budget, and fail loudly if the child survives even that; resolving silently let a rename move a directory under a live child (on Windows the child's cwd locks it outright). The entry stays in the live set until exit is confirmed, so `status` stays truthful. `shutdownAllAndWait` resolves only once every child exited, because a final sync taken while a child flushes would persist a torn file; each runtime drains within the host's budget (managed pods: termination grace minus the sync's share; desktop default 5 seconds), stragglers are SIGKILLed with a short extra wait, and the sync proceeds regardless. Handles without `onExit` count as exited.

Locally there is no volume to drop; teardown only stops the process.

### Runtime death reports

Lives in `src/launcher/runtime-death.ts` (`RuntimeDiedError`, `describeExit`). A runtime that died on its own (cgroup OOM SIGKILL, V8 heap-limit abort) used to be reaped silently; the replacement's `EngineRestartedMidTurnError` knew the turn but not the cause. The host is the one process that sees code, signal and last stderr lines, so it reports them as one `console.error` that becomes a Sentry exception, grouped by class and message head (agent ids vary, causes do not). The message carries the raw fields plus a reading of what the shape usually means.

### Runtime spawn env

Lives in `src/launcher/runtime-env.ts`. Pure, so what a child is told is testable without spawning. `sidecarBinary` tells a re-spawned compiled sidecar to dispatch into the runtime role (`sidecar-entry.ts`). The drain budget is the runtime's graceful window; the host's SIGKILL is the backstop. The role is the whole of what a runtime learns about the assistant. The unserved list is stamped only into the coordinator, the only runtime that calls Houston operations. `HOUSTON_TRANSCRIPT_DUAL_WRITE` is passed only when the host built its pod-auth transcript facade from the complete managed config.

### Runtime environment

Lives in `src/launcher/runtime-parent-env.ts` (`HOST_ONLY`, `RUNTIME_PASS_THROUGH`), `runtime-env.ts`, guarded by `runtime-parent-env.source.test.ts`.

A child's env is the parent's minus `HOST_ONLY`, so host credentials and deployment controls never reach a model-directed process by inheritance (a managed assistant pod carries the account-wide gateway credential). A denylist because the runtime reads env this package cannot enumerate (provider keys, proxy and certificate variables, PATH, HOME, locale), and an allowlist would silently strip the next one. What can be enumerated is every `HOUSTON_*` and `COMPOSIO_*` name the host or `@houston/domain` (where per-spawn stamps are declared) reads; the source test fails until each is classified exactly once.

Per-spawn stamps (`HOUSTON_ASSISTANT_ROLE`, the unserved list, `HOUSTON_SIDECAR_ROLE`) are host-only, because an inherited stale value would outrank the host's decision. `HOUSTON_SUPERVISED` arms the host's parent watchdog and must never reach a runtime. Store tuning and host service endpoints are host-only.

Passed through deliberately: `HOUSTON_HOME` (a path; the runtime resolves the shared Claude login directory `<HOUSTON_HOME>/claude-login` from it), `HOUSTON_SIDECAR_BINARY` and `HOUSTON_MANAGED_CLOUD` (deployment naming in error reports).

An unfronted desktop host authorizes its own assistant gateway with the per-boot token that authorizes every route, so that pair never enters a runtime's environment (one `echo` from bash would read it); a runtime learns only its role.

### Runtime spawner

Lives in `src/launcher/runtime-spawner.ts` (`RuntimeProcessSpawner`, `StderrTail`).

Each agent gets its own process with its workspace directory, loopback port and per-process bearer. Extra env is a function of the spawn spec, because only the coordinator carries a role; no gateway token reaches any child.

stderr is always piped so the exit report has the last `STDERR_TAIL_LINES` (24, enough for a V8 heap-limit block or the runtime's fatal stack) even where stdio is otherwise inherited; the host is the only process that sees how a runtime died.

An unhandled ChildProcess `error` would take the host down, so it is logged and the health probe surfaces the failure.

`onExit` fires once on whichever of `exit`, `close` or `error` lands first: a missing runtime binary emits `error` and `close` but never `exit`, which left the boot polling for the 60-second budget. After `exit` the handle waits up to `STDERR_CLOSE_GRACE_MS` (100 ms) for `close` so the last stderr lines arrive, but never outright, since a grandchild holding the pipe would delay `close`.

SIGTERM lets the runtime drain; `forceKill` is the SIGKILL escalation for a wedged drain.

### Orphan prevention

Pinned by `src/launcher/shutdown.process.test.ts` with real child processes: host shutdown kills every runtime the launcher spawned, a slept agent's runtime dies while others stay, and a crashed runtime is reaped from the live set.

### Parent watchdog process test

Pinned by `src/parent-watchdog.process.test.ts` against the real `local/main.ts`. Unsupervised with a closed stdin (the Docker case) must boot and stay up; a stray `HOUSTON_SUPERVISED` is never inherited by the test child. Supervised with an open pipe that then closes (a desktop force-quit) must tear down and exit 0. Killing child runtimes is proven separately.

Pinned by `src/parent-watchdog.test.ts`. On EOF of stdin from a force-quit supervisor the host tears down and exits, even if a kill fails (logged). It arms only with `HOUSTON_SUPERVISED=1`; the old non-TTY gate armed under Docker `tsx` (closed stdin) and crash-looped.

### Sidecar entry

Lives in `src/sidecar-entry.ts`. The one file `bun build --compile` bundles. It runs as the host, or as a pi runtime when `HOUSTON_SIDECAR_ROLE=runtime`, and the host spawns itself in runtime mode so the packaged app needs no Bun or source. It records `HOUSTON_SIDECAR_BINARY` so `runtimeCommand()` can spawn the same binary. It does a cross-package dynamic import of the runtime, so it is excluded from the host's tsgo typecheck and resolved by Bun's bundler. It also carries the packaged browser smoke check (`scripts/smoke-sidecar-browser.sh`).

### Smaller rules

`src/parent-watchdog.ts`: the shell spawns the host with a piped stdin it never writes, in its own process group, so the app's death does not kill it; a force-quit sends no signal, only EOF, which tears the host down (child runtimes first), counterpart of the Rust engine's watchdog. Windows has no EOF on `TerminateProcess` and uses the Job Object. Armed only by `HOUSTON_SUPERVISED=1`; `end`, `close` and `error` all count; the stream is set flowing so `end` fires; a concurrent SIGTERM tears down once; teardown failures are logged and the process still exits.

`src/testing/launcher-contract.ts`: launchers must return a reachable endpoint, reuse a warm runtime, re-wake after sleep and track agents independently.

## Credential stores

### Account blocked

Lives in `src/credentials/account-blocked.ts` and `remote-blocked.ts`. A provider refusing to mint because the account is blocked (GitHub's Copilot 403 "billing is currently locked") must never sign the user out (a reconnect changes nothing) and will not heal on retry; mirrors the gateway's `AccountBlockedError`. Only a 403 mentioning both "billing" and "locked" qualifies, since GitHub also 403s for its automated-use limits and missing Copilot access. Both `error_details.message` and `message` shapes are read, falling back to raw text inside pi-ai's `"<status> <text>: <body>"` message. The detail handed to surfaces is capped at 200 characters. The managed-pod store reads the gateway's typed `provider_account_blocked` 502 and the serve relays the same answer.

Lives in `src/routes/credential-blocked.ts` (`answerAccountBlocked`). The same typed 502 the gateway's serve answers, so the runtime reads one shape everywhere. Not a 404 (the runtime must keep its copy and nothing may read it as sign-out). `Retry-After` paces the serve sync like the gateway's failed-refresh memo.

### Disconnect on rejected refresh

Pinned by `src/credentials/disconnect.test.ts`. The rejection condemns exactly one credential; the store re-read decides whether it still applies and must never hand back the condemned credential as a supersession (the remote store's 15-second cache can return it). A rejected-refresh drop is tombstoned like a revocation. Store failures here (inside the serve route's catch) must not escape as a 500.

Lives in `src/credentials/disconnect.ts` (`disconnectRejectedCredential`). An OAuth rejection of the refresh token never heals, so the credential goes, but only the one rejected: a reconnect or a sibling host's rotation in the meantime leaves a valid row an unconditional delete would remove. The digest comes from the caller's copy, the fail-safe direction (a mismatch deletes nothing and the next serve re-reads). The coalescer's state for the key is forgotten either way. The drop is tombstoned like a revocation, because automatic refills would loop fill, refresh with the superseded token, `invalid_grant`, disconnect. After a failed compare-and-delete the current row is returned for the caller to serve through its checks; a read failure reads as absent (this runs inside the route's catch); a returned row with the rejected digest is not a supersession.

### Local credential file store

Lives in `src/credentials/file-store.ts`. The host owns the subscription token in one JSON file (0600, atomic swap), so a login survives restarts and a runtime's environment only ever holds a short-lived access token. A corrupt file means reconnect, never a crashed boot. Rows are keyed by acting identity too, but desktop and self-host never carry one, so their records keep the exact historical shape and load without migration; only a member's row persists `scopeKey` (the dev launcher's managed posture without the credential gateway produces members). `removeIfAccess` is a compare-and-delete on the reporter's own row only.

### Credential gateway wire

Lives in `src/credentials/gateway-wire.ts`. No refresh token crosses a GET; served credentials have an empty `refreshToken` so nothing downstream attempts or leaks a refresh. `isNotConnected404` is true only for the gateway's JSON-bodied 404; a route-level 404 is a transport error.

### Refresh coalescer

Lives in `src/credentials/refresh-coalescer.ts` (`CredentialRefreshCoalescer`, `sharedCredentialRefresher`).

Single-flights refreshes per (workspace, scope, provider): a desktop runs one runtime per agent, each serving per turn and per providers poll, and providers that rotate on use answer the first exchange and reject the rest as `invalid_grant`, which the route reads as a dead session. Scope is part of the key so one member's rotation never reaches another's serve.

The credential is re-read inside the critical section (another process or flight may have rotated it). Null means the user disconnected mid-flight: `CredentialGoneError`, never a refresh that recreates the row.

Results are cached for `REFRESH_RESULT_TTL_MS` (30 seconds, enough for a turn start's burst) and swept, since entries hold full secrets. Failures are never cached.

A flight removes only its own slot, and `forget` drops only cached results, never in-flight state, because a new flight may own the slot by then and evicting it would allow a second concurrent exchange.

The caller's `skewMs` is honored on the in-flight re-check. A caller with its own refresher still lands in the process-wide flight. One process-wide instance.

### Central refresh

Lives in `src/credentials/refresh.ts` (`refreshCredential`, `isExpiring`) and `oauth-token-exchange.ts` (`exchangeRefreshToken`).

The control plane is the single refresher of each workspace's subscription token. Endpoints and client ids mirror pi's own OAuth. API-key credentials never expire and are returned unchanged.

Only the OAuth server's verdict on the grant is terminal (`RefreshRejectedError`), because the serve route deletes on it: `invalid_grant`, `refresh_token_invalidated` (OpenAI, session ended) and `invalid_refresh_token` (OpenAI's current dead-token answer). Codes are added only on wire evidence. `invalid_client` is deliberately not terminal: it condemns Houston's shared public client id, and a retired id would otherwise delete every workspace's credential. Unparseable or other bodies are never terminal; the raw body stays in the message. Both RFC 6749 and OpenAI's nested error shapes are read.

Retry is a rotation decision: only failures that provably predate the connection (`ENOTFOUND`, `EAI_AGAIN`, `ECONNREFUSED` on undici's `cause`) are retried, up to two attempts with 250 to 500 ms jitter. Timeouts, aborts, resets, 5xx, 429 and any 4xx may follow a consumed grant and are never retried. Exhausted retries are never terminal, so the route serves the stored token. Exchanges time out after `REFRESH_TIMEOUT_MS` (10 seconds). The rotated refresh token is persisted whatever comes back; `accountId` is kept from the stored row.

GitHub Copilot does not use a refresh grant: pi-ai's Copilot OAuth mints the short-lived (about 25 minutes, with a 5-minute skew) Copilot token from the long-lived GitHub token stored as `refreshToken`, through the provider's `auth.oauth` surface (pi 0.80.8 removed the standalone export). `enterpriseUrl` routes the mint at `api.<domain>/copilot_internal/v2/token` and is preserved. pi 0.84 and later require an abort signal. A 403 naming a billing lock is a typed account block, not a dead token.

### Shared endpoint store

Lives in `src/credentials/remote-shared-endpoint-store.ts`. The managed-pod client for the gateway's single organization endpoint share.

### Remote credential store (managed pods)

Lives in `src/credentials/remote-store.ts` (`RemoteCredentialStore`, `scopeKeyOf`).

The pod never owns refresh-token rotation; the gateway is the single refresher and pods fetch access or API-key material just in time. Only the gateway's own "not connected" 404 (with a JSON error body) means logged out; any other failure, including a route-level 404 from a skewed or misconfigured gateway, throws so the runtime keeps its last token. A skewed 404 is not negative-cached.

`get` is cached for 15 seconds; `invalidate` exists because a reconnect lands centrally without passing through this process. Invalidation is per acting identity. Provider-blocked answers are not cached (the gateway's memo paces upstream).

`ifAbsent` rides as `x-houston-if-absent`, atomic under the gateway's per-(org, provider) row lock.

`remove` is idempotent (the not-connected 404 means already gone) and also clears the legacy adoption file entry, or the next 404 adoption would resurrect the credential org-wide.

`removeIfAccess` sends the digest as `x-houston-if-access-sha256` on the same DELETE, so the comparison happens under the gateway's row lock and a racing reconnect waits rather than being deleted. The scope header says which kind of row and the acting header says whose; a personal row cannot be addressed without the acting identity. Only a real removal invalidates local state, and only the reporter's cache entry, since a superseded report's cache may describe the newer credential.

404 adoption from the legacy local file is refused while a revocation tombstone stands (the file holds the same dead family), and legacy pre-verification API keys are dropped instead of adopted. No path may seed the gateway with a key the serve guard would refuse.

Scope keys use the shared derivation (`credentials/scope-key.ts`); an unreadable token is named by digest because keys reach logs, and distinct unreadable tokens keep distinct scopes.

### Revocation tombstones

Lives in `src/credentials/revocation-tombstones.ts` (`RevocationTombstones`, `sharedRevocationTombstones`). After a confirmed revocation delete, automatic refills of that (workspace, scope, provider) are refused for 15 minutes: old desktop builds keep pushing cached snapshots with `if_absent` every 15 to 30 seconds, and pod-side legacy adoption and the healer refill too, each refill failing the next turn into another report. The tombstone is not digest-scoped, because a cached snapshot of the revoked family carries a different access token than the one reported. `active` checks both the caller's key and the shared team key, since the pod cannot always mirror the gateway's row resolution. User-driven connects arrive without `ifAbsent`, are never blocked, and clear both keys. `mark` reports whether a tombstone was still active, which means a refill got past the guards and should escalate. One process-wide ledger; the map is swept.

### Credential store contract and scope keys

Lives in `src/credentials/store.ts` (`MemoryCredentialStore`, `scopedKey`), `scope-key.ts` (`credentialScopeKey`), and the shared contract in `testing/credential-contract.ts`.

The control plane is the single owner and refresher of each workspace's subscription token; sandboxes only serve a fresh access token. Every adapter passes one shared contract; out-of-repo adapters are held to the same bar. The file store additionally persists across restarts.

The acting identity is part of the key: ignoring it would serve one member's subscription to another and let either delete the other's. The memory adapter is reachable with a member identity under the dev launcher.

The team key omits the scope entirely, byte-identical to the pre-scope form, so existing desktop credential files load without migration and keep their shape on write; a regression would sign every existing desktop user out.

`credentialScopeKey` mirrors the runtime's `credentialScopeKeyFor` (`packages/runtime/src/session/acting-context.ts`) so one identity resolves to the same row on both sides. No token means the team key. An unreadable token is not the team (that would let a garbled token read the team credential); it gets an isolated key named by a digest of the token, because keys reach logs.

`removeIfAccess` is compare-and-delete on the reporter's own row only.

Fill-only puts drop a stale snapshot when a row exists.

Lives in `src/testing/credential-contract.ts`. Every adapter must agree on null before put, faithful round trip (refresh persists access, refresh, account id and expiry), upsert in place, per-(workspace, provider) isolation and idempotent remove. The suite runs twice, once for the team scope (calls byte-identical to pre-scope callers) and once as a member, plus cross-scope tests: a member's row is never visible to or removable by the team or another member, and a personal revoke report never drops the team's row even when both hold the same token. The only normalized field is `kind`, because consumers derive api-key-ness from the sentinel. Member tokens are minted in the gateway's `acting-v1.<payload>.sig` form.

### Sandbox token vault

Lives in `src/credentials/vault.ts` (`EnvCredentialVault`). Sandbox tokens are non-secret identities proving "workspace W's agent A": `base64url(JSON {workspaceId, agentId}).hex(HMAC-SHA256(payload, sandboxTokenSecret))`. A sandbox cannot produce another sandbox's token, and the token reveals and grants nothing beyond the sandbox routes. LLM credentials are users' own subscriptions; there are no org provider keys. The signature compare is constant-time, with a length check first because `timingSafeEqual` throws on mismatch.

### Shared endpoint sync

Pinned by `src/shared-endpoint/sync.test.ts`. An organization endpoint is re-seeded even when the visible descriptor is identical, because the status never exposes the key and an owner's reconnect rotates the proxy key under the same tunnel URL.

Lives in `src/shared-endpoint/sync.ts` (`syncSharedEndpoint`). Never fatal to pod startup. Clearing an org-hydrated endpoint logs loudly, because it logs out the runtime's openai-compatible provider; an endpoint vanishing without that line came through the logout route. The endpoint is re-seeded on every spawn even when the descriptor looks identical, because a reconnect rotates the proxy key under the same tunnel URL and the status never exposes the key.

## Routine scheduler and triggers

### Fire turn options

Lives in `src/fire-turn-options.ts` (`FireTurnOptions`). `actingUser` is the local routine creator's bare sub; `actingAs` is a minted token for externally scheduled fires and replaces it; both are absent for creator-less legacy routines. `limits` are those of the person the work is for (a mission inherits its parent turn's). `routine` marks routine runs so the standing channel sets `ROUTINE_FIRE_HEADER`. `nonce` is the sender's retry identity, carried on the persisted user message so callers (the morning briefing) can find their turn.

### Run cancel

Lives in `src/schedule/cancel.ts` (`cancelRunRow`, `cancelRoutineRun`). The row goes terminal first under the runs-file queue (reconcile re-checks status, so a finishing turn cannot flip it back), then the live turn is aborted; an abort failure is logged loudly and reported as `abortFailed`, and the run stays cancelled. A pooled run stopped by a person may have no row yet (a stopped worker lands nothing), so the cancelled row is recorded from the claim's facts, inserted by start time under the history cap, and dropped if the cap would evict a newer run. Asleep runtimes report not running without a cold start.

### Fire lock

Lives in `src/schedule/fire-lock.ts`. The shared atomic primitive for every scheduled fire path, keyed per routine instant. The instant is burned before the busy gate, so a false result means another fire path already consumed it.

### Fire outcome ledger

Lives in `src/schedule/fire-outcome.ts`. The burned-instant lock doubles as the outcome ledger so a redelivery replays what happened. A fresh burn writes `FIRE_IN_FLIGHT`, which a redelivery answers with 503 (the first may still fail). The local scan and older hosts burn `"1"`, which, like any non-JSON value, decodes as nothing to replay. Errors are capped at 1,000 characters. `isRetryableFireError` covers failures about where the fire ran (drain, rename, unreachable runtime, a runtime refusing while it drains, an unrecorded run); a raw `fetch failed` reaching it never came from the turn POST, since ProxyChannel lets only dial failures through and wraps the rest as delivery-uncertain. `reportUnfiredFire` logs faults at error level (only `console.error` reaches Sentry) and expected states (busy, nothing connected, drain or rename deferral) as warnings; an unrecorded run history is a fault even though redelivered.

### Firer, snooze and auto-pause

Pinned by `src/schedule/firer.test.ts`, `snooze.test.ts`, `auto-pause*.test.ts`, `reconcile-abandoned.test.ts`. The firer uses the same per-workspace channel as a user message, with the instruction inside run framing that stops an "every hour, …" prompt from reading as a request to create a routine. The provider pin rides the turn so a routine keeps its provider regardless of other picks; `routines.json` is never rewritten, so legacy pins and aliases still fire on what they named, and unknown ids are rejected at fire time with a sentence naming the provider as people read it (`providers/provider-copy.ts`); any provider saves accept must fire. The creator's sub rides `x-houston-acting-user`, replaced by the signed token on control-plane delivery; legacy routines without a creator carry none. A plan usage-limit failure snoozes the routine until the provider's reset (enabled stays true), and skipped instants never fire. A streak of same-kind user-fixable failures after the last edit pauses the routine with the typed reason and announces `RoutinesChanged`; transient failures never do; an unpinned routine pauses as `no_model` and resumes on the model the person picks; a pause hitting a rename hold is retried by the next failure.

Lives in `src/schedule/snooze.ts` (`settleRoutineRuns`), `auto-pause.ts` (`pauseFailingRoutines`), `run-failure.ts`.

After runs settle: a plan usage limit snoozes its routine until the reset at once (one run is proof enough), an answered run lifts a snooze, and every other typed wall feeds the auto-pause streak. Snooze lands first so the pause reads what it wrote. Callers must not hold the runs queue, which is not reentrant. Manual rows neither snooze nor lift, since they ran as the presser.

Writes take the same per-document lock as every routine write, so a concurrent edit is never lost, and an edit that landed first (a resume, a model change) moves the streak's start past the failures. Lock order is the runs queue first, then the routines document, so no run settles between the streak read and the pause save.

Failure classification is pure and shared with the pooled worker (`@houston/domain`). A routine fires on its creator's credential scope, so failures say whose account needs the fix; the typed code drives surfaces and `summary` is the history's verbatim English. Unconnected refusals are not transient. The usage-limit sentence leaves the reset time to the surface, which knows the reader's zone and language. Other provider failures use the provider's own words.

### Channel routine firer

Lives in `src/schedule/firer.ts` (`ChannelRoutineFirer`). Fires through the same per-workspace channel as a user message; a missing channel or a busy, quota or transport failure throws and the run is recorded errored. The suppression instruction rides the prompt so the agent emits `ROUTINE_OK` for a silent run. Pins ride alongside with `routinePin`'s read-time legacy mapping. Routine fires pin Autopilot mode so they never block on an `ask_user` question (a missing connection still queues a connect card and the turn ends). Local fires thread the creator's bare sub; control-plane fires inject the minted token instead. A pin naming no known provider fails the run immediately with the reason.

### Reconcile

Lives in `src/schedule/reconcile.ts` (`reconcileAgentRuns`), `reconcile-decide.ts`, `reconcile-replies.ts`.

A running run completes by reading its conversation: silent (`ROUTINE_OK` with suppression) or surfaced (a board activity, reused per routine and pointed at the latest run), with parity to the Rust runner. An empty reply classifies ("Nothing to report"), never reads as in flight. No reply past the timeout errors.

A run whose routine was deleted settles `cancelled` once its turn is over, because a running row holds the busy probe and kept engines awake. A `routines.json` the reader had to repair cannot prove an id missing, so orphans wait until it reads clean.

One replica owns each completion via `setNx`. Surfaced activities are saved before the runs re-read so the re-read and save stay await-free; the re-read happens under the runs-file queue and applies an update only while the row is still running, so a user cancel is never resurrected. Non-terminal updates are patches merged onto the fresh row (a resume flag must not revert a usage-limit pause or an activity id); terminal updates replace the row.

A failed turn's persisted `providerError` errors the run now with the real reason; credential walls get a sentence naming whose account (the creator's for personal or unattributed scope, the space's for team scope), since the raw "no provider connected" misleads a reader whose own account is fine.

An `interrupted.resumed` reply means the engine is re-running the turn itself: the run records a resume and its 15-minute budget restarts from the interruption. A dead turn (abandoned pool claim) settles now as interrupted unless its own reply arrived.

In a shared chat a reply stamped with another run's turn id belongs to that run; a pooled run's id is its turn id. The transcript shadow answers with the latest reply when enabled, but a stamped reply in the file wins; abandoned runs read the file only.

The pool worker narrows a sweep to one conversation and its dead turns, and runs settlement (snooze, lift, auto-pause) after its sync-back.

### Firing a run

Lives in `src/schedule/run.ts` (`fireRoutineRun`, `RoutineBusyError`, `RoutineRunUnrecordedError`).

The single path for scheduled and run-now fires. Per-routine in-flight gate (a routine with a running run never double-fires into the same conversation); the gate and record write run under the per-agent runs-file queue. The running row is persisted first, then the turn starts outside the queue so a cold start never blocks a cancel. A stuck running row is timed out by reconcile.

A fire failure marks the run errored and rethrows. If the running row cannot be written before, or the errored mark after, `RoutineRunUnrecordedError` keeps a delivered instant deliverable, because the person would have nothing to see.

Run-now rows are marked manual, since snooze rules trust only the creator's runs.

History is pruned to the Rust engine's per-routine cap.

A runtime refusal because nothing usable is connected for the creator blames the routine's pin, else the saved provider the refusal names, else `no_model`, all typed so the streak pauses. A missing or terminal row after a failed fire means a cancel raced it, which wins. A failed pause after the errored row is reported but never replaces the fire's own error.

### Runs file queue

Lives in `src/schedule/runs-lock.ts` (`storeSyncRunsLock`). Every runs writer (fire, cancel, reconcile) rewrites the whole file from a snapshot, so writes are queued per agent root within the process; replicas arbitrate with `setNx`. The queue is held only around load and save, never across a turn POST or a cold start. The store-sync daemon holds the same queue while a merge rewrites an agent's run history (synced paths are `<workspacesDir>/<Workspace>/<Agent>/…`), so no load and save can span the rewrite.

### Scan failure logging

Lives in `src/schedule/scan-failure-log.ts`. One unreadable routines file used to log on every tick (120 Sentry events an hour). A failure logs when it starts and when its reason changes, repeats once an hour (`SCAN_FAILURE_REPEAT_MS`) so a broken agent never goes silent, and a successful scan clears the streak.

### Interval schedules

Pinned by `src/schedule/scheduler-interval.test.ts`. An `@every` routine fires on its true interval (after a 12:48 fire, every 16 minutes next fires at 13:04), whereas cron `*/16` restarts the hour at 13:00.

### Routine scheduler

Lives in `src/schedule/scheduler.ts` (`Scheduler`, `EXTERNAL_FIRE_GRACE_MS`) and `agent-scan.ts` (`scanAgent`).

Every tick scans all agents and fires routines due in `(lastTick, now]` exactly once. Multi-replica safe by construction: the due instant is the cron time, so a per-(routine, instant) `setNx` lock lets one replica fire; no leader election. `lastTick` resets to now on start so a fresh replica never replays history. The timer is unref'd. Scan every 30 seconds by default; the dedup TTL (default 1 hour) must exceed the scan interval.

Fail-isolated at every level: agents write their own `.houston` docs, so any can be unreadable; `lastTick` advances before the scan, so an escaping throw would drop that window's instants for every agent behind it. A workspace or agent that throws is logged (once per failure, not once per tick, `scan-failure-log.ts`) and skipped. Runs live in their own document, so they settle even when `routines.json` is unreadable.

One account-wide timezone governs every routine, re-read each tick so a change re-times every routine.

`external` mode disables cron fires only; reconcile still runs.

`EXTERNAL_FIRE_GRACE_MS` (2 minutes) applies where the control plane also delivers fires (managed cloud): its delivery carries the creator's minted identity and credentials, while the pod-local path can only use the team scope (pods cannot mint identity), so racing the delivery made which credentials ran depend on load. The grace shifts the whole evaluation window, so consecutive windows still tile and each instant is evaluated once at its true cron time with the same dedup key the delivery burns. The left edge clamps to scheduler start so a restarted pod never re-fires an instant whose process-local burn was lost. It must stay well under the dedup TTL and above the delivery's worst top-of-hour lag (about 15 seconds).

A busy routine skips the instant quietly. A creator with nothing connected is an expected state (warning breadcrumb; the errored run says why). The firer resolves when the turn is accepted, not completed.

### Trigger creator check

Lives in `src/triggers/acting.ts` (`assertActingIsCreator`, `TriggerCreatorMismatchError`). Pods hold no gateway HMAC key, so the strongest check on this pod-token route is that the minted token's subject equals `created_by`; otherwise the run would use another person's credential scope. A mismatch is permanent for that delivery (the control plane minted from its projection, which disagrees with the pod's file), answered 400 with a code like routine fires.

### Trigger event firing

Lives in `src/triggers/fire.ts` (`fireTriggerEvents`). One firing path for the pod route and the self-host webhook ingress. Event ids are the dedup key (the cloud outbox row id, or Composio's event id in-process). Results: `fired` (mark delivered), `busy` (retry later, fresh locks released), `no_routine` (mark delivered). Only enabled routines with a `trigger` binding match. Each event is deduped through `trigger-event:<id>` so a redelivery or a crash before delivery was marked never double-fires; a routine whose events were all consumed is acked without a run; a fresh batch fires one run. `TriggerEventLock` adds release to `setNx`. The creator's minted token makes the run use the creator's credential scope (a pod cannot elevate a bare sub, so webhook runs used the team credential and failed for personally connected providers), and the acting identity is checked against the creator before any lock is burned. An unconnected refusal consumes the events (the typed errored run is the record, and redelivery would add rows and could complete the auto-pause streak alone); any other failure releases them and rethrows.

### Smaller rules

`src/triggers/trigger-firer.ts`: identical to the channel firer except the prompt frames the batch's events; it pins Autopilot and the routine's provider; unknown pins fail at fire time; the minted token replaces the bare creator header.

## Vfs, workspace store and file watcher

### Workspace paths

Lives in `src/paths.ts` (`WorkspacePaths`, `CloudPaths`, `LocalPaths`). The one seam where cloud and local layouts differ, so handlers stay layout-blind. Cloud: prefix `ws/<wsId>/<agentId>`, agent root `…/workspace`, data root `…/data`, pinned by a contract test. Local: the existing desktop tree, agent root `<Workspace>/<Agent>`, data root `.houston/runtime` inside it, preserving users' files; the id carries a slash, which URL transport encodes. `sharedRoot` is the workspace-shared subtree (ADR 0003): beside agent prefixes in cloud (ids are synthetic, so no collision), a dot directory locally so discovery never mistakes it for an agent.

### Local workspace store

Lives in `src/store/local.ts` (`LocalWorkspaceStore`). The desktop tree on disk is the source of truth: workspaces are subdirectories of the root and agents subdirectories of those; ids are the paths (`<Workspace>/<Agent>`), flowing unchanged through LocalPaths, the watcher and events. The preferences namespace is never a workspace; listing it once seeded a phantom agent a pod then booted. Ids with extra separators are rejected. Every workspace belongs to the single local user and runs `local`. Name conflicts are checked on every filesystem, so a case-sensitive volume refuses what macOS would. A plain non-recursive mkdir is the atomic claim, so a returned agent is always a folder this call created. Rename checks before `renameSync`, since moving onto an existing directory throws a raw ENOTEMPTY; a re-spelling of the agent's own name is allowed.

Pinned by `src/store/local.test.ts` and `memory.test.ts`. An id that would resolve outside the store root is refused. A failed rename leaves both directories untouched. Renaming to the current name is a no-op success. The owner sees every agent.

### Memory workspace store

Lives in `src/store/memory.ts`. Source of truth for tests and dev mode. Name conflicts compare as the disk store does (`sameAgentName`) and are typed conflicts, never raw failures. Slugs are DNS-safe.

### Workspace store contract

Lives in `src/testing/store-contract.ts`. Every adapter must provide lazy personal-workspace provisioning, agent CRUD, owner-sees-all listing, cross-workspace isolation and errors on unknown ids. Deliberate divergences: id shape (opaque versus on-disk names), personal workspace semantics (per user versus the single local user's first directory), `setWorkspaceRuntime` (local throws, a laptop is always local), and `createdAt` and slug values. `secondWorkspace` stands up a second workspace per tenancy model.

### Vfs contract

Lives in `src/testing/vfs-contract.ts`, never faked green. `keyCase` must describe what the adapter actually does (the collision guards trust it, so reporting a fold it does not perform is worse than no answer), including Unicode normalization; `exists` must match, because the upload dedupe decides write destinations with it. Text reads strip a BOM; byte reads stay lossless. `move` onto a different object is refused with a typed error and the neighbour survives; dropping a folder on a folder is refused and neither loses a file (backends disagree on what it means, so the outcome is what is pinned); a re-capitalization on a folded backend succeeds. Deleting an absent key is a no-op. A file is not a prefix. Overwrites must be atomic, so `createdMs` after an overwrite is only guaranteed not newer than the write; a move keeps it. Backends without birthtime may omit it.

### Atomic write regression

Pinned by `src/vfs/fs-atomic-write.test.ts`. Overlapping writes and reads must always observe a full old or full new payload, and no temp file may remain.

### Read-only storage

Pinned by `src/vfs/fs-readonly.test.ts`. A locked workspace (read-only mount, revoked permissions, a sync client holding it) must raise the typed refusal for save, delete, rename, folder delete and the case probe, keep the original errno as `cause`, leave reads untouched, and survive PrefixedVfs. Skipped as root, which ignores mode bits.

### Filesystem vfs

Lives in `src/vfs/fs.ts` (`FsVfs`), `fs-scratch.ts`, `fs-listing.ts`, `fs-writable.ts`, `fs-read.ts`.

Keys map one to one to paths under `root`, so user and agent touch the same files; every key is checked to stay under `root`.

`keyCase` is probed once per root and remembered, because the answer belongs to the mounted volume. A failed probe is not cached (a transient EIO must not decide every later rename), nor is an answer borrowed from an ancestor because `root` did not exist yet (a bind mount or removable disk could still appear there). The probe writes one scratch file whose stem is lower case with a decomposed ñ and looks it up upper-cased and composed; `process.platform` is not the answer (case-sensitive APFS, exFAT or SMB on Linux, bind mounts). A missing root is probed from its nearest existing ancestor rather than created. Only ENOENT answers the question; any other error throws rather than guessing exact.

Writes are atomic temp and rename in the same directory with a unique infix and `ATOMIC_TMP_SUFFIX` (from `@houston/protocol`, shared with the store-sync walk's exclusion): in-place writes let readers see truncated JSON. `writeFileFrom` streams file to file so large uploads never sit in memory.

`move` uses `lstat` on both sides, because `rename(2)` moves links: following them makes a link and its target look like one inode (so the user's file would be replaced by a self-pointing link) and makes a broken link look absent. The destination is asked by path so the volume's folds apply; the same inode means a re-spelling, which is allowed. Accepted race: between the check and `rename(2)` another writer could create the destination in a microsecond window; closing it needs `RENAME_NOREPLACE`, which Node lacks, and `link`/`unlink` fails on exFAT, SMB and directories. Only the rename tail is wrapped as a write, because the `lstat` guards are reads and an untraversable parent fails them with the same EACCES; calling that a write refusal would tell the person "we could not save" for a file Houston could not read.

Listing always races the writer: a vanished entry (or a parent turned file) is simply absent, while EACCES and EIO still throw. In-flight atomic temp files are skipped (a user file merely ending in `.tmp` stays). A missing prefix or a file prefix has no keys under it, as an object store answers. Times are truncated, never rounded, since rounding up can name an instant after the read; birth time 0 (Linux without birthtime) is omitted.

A capped read sizes its first read from stat, then keeps reading until EOF or past the cap.

### Lazy store vfs

Lives in `src/vfs/lazy-store*.ts` (`LazyStoreVfs`, `LazyOwnership`, `Materializer`, `fetchObject`, `UNREAD_HASH`, `LazyReadRefusedError`).

Listings and stats come from the store manifest; an object is downloaded into the local overlay the first time a handler reads it; writes and deletes land in the overlay for the caller's sync-back. The shared manifest is the sync-back ownership boundary (materialized keys plus `UNREAD_HASH` entries for keys written or deleted without a read), so untouched remote objects are never re-uploaded or deleted. Remote directories exist only as their descendants, and writes keep a real tree's file and directory exclusivity so the next eager hydrate cannot fail.

`UNREAD_HASH` never equals a real digest, so a local file under it uploads with the recorded generation as its CAS guard and an absent one is deleted under the same guard. A generation-minting store sees `ifGenerationMatch` on every upload or delete of an unread key, and create-only (`0`) on keys it never had. A store-side copy stays remote and unowned until read or changed.

`keyCase` is the overlay's, since every write lands there; `exists` checks overlay and store, since an unread remote object still occupies its key. Moves check the store half too and raise a typed `VfsExistsError` for directories and files alike, so `moveOrRefuse` answers 409 rather than 500.

An object deleted by another writer between listing and first read is absent (dropped from the remote view and the sync manifest), never a failed turn. Moving a vanished source fails like a missing file.

A keyed document replaced unread still fetches the bytes it replaces as the merge base for a lost upload race; only bytes provably at the listed generation are kept as the base.

Per-object and aggregate caps are checked from the manifest before download and from the landed bytes after; a refused or partial download leaves nothing on disk (the store adapter need not replace atomically). A refused private directory (`private-paths.ts`) lands nothing. Refusals map to "unavailable while asleep" for reads and a decline for writes, never a partial result. Concurrent reads of one key share one fetch, and local writes wait out a landing download.

### Memory vfs

Lives in `src/vfs/memory.ts`. A folded MemoryVfs really resolves `README.md` to a stored `readme.md`, so collision guards are tested against actual data loss on any CI volume. Writing another spelling opens the existing object and keeps its name, as `open(2)` does; overwrites and moves keep creation time; the moved object carries the spelling it was given. Its `move` refuses a destination that resolves to a different stored object.

### Prefixed vfs

Lives in `src/vfs/prefixed.ts`. Re-roots keys under a prefix of another vfs, bridging op handlers that address agents relative to `workspaces/` with a store vfs rooted one level up. Re-rooting never changes key comparison or weakens any guarantee (the cloud op path, `runtime/src/turn/op-route.ts`, runs every file through it).

### Vfs port

Lives in `src/vfs/vfs.ts` (`Vfs`, `KeyCase`, `VfsExistsError`, `VfsReadOnlyError`, `decodeText`, `assertSafeKey`).

Keyed blobs under `ws/<workspaceId>/<agentId>/…`. Implementations: MemoryVfs (tests and `CP_DEV=1`), FsVfs (the local profile's real agent directory), PrefixedVfs, the lazy store vfs; a GCS adapter lives outside the repo and must pass the shared contract (`testing/vfs-contract.ts`). Keys are forward-slash paths and every implementation rejects `.`, `..` and absolute keys.

`KeyCase` (`fold` exact or folded, `normalize`) is a property of the mounted volume and cannot be derived in JavaScript: APFS folds through its own table (`straße.txt` equals `STRASSE.txt` while `toLowerCase()` disagrees) and resolves NFC and NFD names to one file. It is asynchronous because it must be asked of the volume. It feeds the cheap pre-check; `move` is the guarantee: it throws `VfsExistsError` rather than replace a different object, while re-spelling one object still renames. `exists` answers the volume's way and is safe for deciding upload destinations.

Every write primitive (and the case probe, which must write) throws `VfsReadOnlyError` on EACCES, EPERM or EROFS: the person's storage, not a Houston fault, raised at the one seam every writer passes so no caller has to remember permissions. Routes turn it into their own refusal.

`decodeText` strips a UTF-8 BOM at the single decode door: Node keeps it and `JSON.parse` rejects it, and editors (the Windows default) emit it, so one invisible byte bricked a routines file for days; the next save rewrites it clean.

`createdMs` is absent when the backend cannot report it.

### Watch classification and races

Lives in `src/watch/classify.ts` (`classifyChange`) and `watcher-race.ts` (`isBenignRecursiveWatchRace`). Classification is the shared domain `agentFileEventType`, so the watcher and the web adapter's echo agree; `.shared` paths map to shared events; anything outside an agent is null. Node's Linux recursive `fs.watch` is implemented in JS and re-scans with `readdirSync`; a transient directory deleted in between (pi's `auth.json.lock`, created and removed around every credential refresh and not configurable) throws ENOENT from Node internals as an uncaught exception no watcher handler sees. The race is harmless (the next event re-scans, and store sync has its periodic pass), so exactly this signature is demoted to a warning.

### Directory-only tree watch

Lives in `src/watch/watch-tree.ts` (`watchTree`). macOS and Windows use native recursive `fs.watch`. On Linux, Node's userland recursive fallback registers one inotify watch per file, re-registering on every new file (temp files included), which exhausts the pod-shared budget and makes later file ops fail ENOSPC; directory watches already report their children, so only directories are watched. `onError` fires at most once, on the first non-transient failure (ENOSPC expected), and the watcher keeps serving what it holds; the store-sync periodic pass is the fallback. A missing root throws; ENOSPC on root degrades instead of crashing. A directory deleted between event and watch is skipped. Subdirectories are scanned after watching so ones created mid-scan surface as events. `.git` is never watched (a parent may still surface a shallow `.git` child event, which classification nulls) and `excludeDirs` skips subtrees another watcher owns.

### Smaller rules

`tests/account-fixture.ts` (`slowReadVfs`): reads answer with the state seen at start and return later, widening the preference document's load-merge-save window so an unserialized second writer would save over the first.

`src/paths.test.ts`: CloudPaths must reproduce the exact cloud keys; the cloud shared root is what the pod-store scopes (`OrgRoot + "/shared"`) and the local dot name keeps discovery from listing it; the watcher's `agentPath` equals the local agent root so host and user writes align.

`src/testing/store-name-contract.ts`: a name belongs to one agent per workspace under `sameAgentName`, and create onto a taken name refuses rather than returning the existing agent.

`src/watch/classify.ts`: path to event classification mirrors the Rust file watcher; `routine_runs` versus `routines` prefix overlap is the tricky case, and only files inside an agent produce events (`.git` and the agent directory itself do not).

`src/watch/watcher.ts` (`FsWatcher`): the local counterpart of cloud's post-mutation emits; events coalesce per (agent path, type) over a short debounce; watcher errors are logged and coverage continues (the callback carve-out of the no-silent-failures rule).

`src/store/local-preferences-namespace.test.ts`: on a pod FsVfs and the store share `/data/workspaces`, so `ws/<wsId>/preferences.json` is a real folder; it must never list as a workspace (it once booted a phantom agent) nor be picked as the personal workspace on a fresh desktop.

`src/store/contract.test.ts`: per-adapter divergences (id shape, provisioning, `setWorkspaceRuntime`) are pinned outside the shared contract.

`src/domain/types.ts`: personal workspaces are free and single-player, with access by ownership only; `org` is modeled but not built; the wall between agents is the per-agent sandbox. Runtimes: `gke` (legacy pod plus PVC), `cloudrun` (per-turn, default for new workspaces), `local` (subprocess on the user's machine).

`src/domain/access.ts` (`canUseAgent`, `ownsWorkspace`): the one pure access decision, pure ownership; it decides visibility, not isolation.

`src/watch/watcher-race.ts`: only ENOENTs whose stack carries Node's recursive-watch frames are benign.

`src/store/local-dirs.ts`: dot directories are never agents or workspaces; the preferences namespace only holds `<workspaceId>/preferences.json`.

`src/vfs/index.ts`: out-of-repo Vfs adapters bind behind the port, never through this barrel.

`src/vfs/synced-store.ts` (`SyncedStoreVfs`): awake pods keep files on disk for the runtime and adopt store-side copies.

## Store sync and doc shadows

### Doc shadow publish

Pinned by `src/docs/http-shadow-publish.test.ts`. `publish` is the reporting put: a caller announcing a document learns whether it landed.

### HTTP doc shadow

Pinned by `src/docs/http-shadow.test.ts`. Content comparison is order-insensitive (jsonb reorders keys). The canonicalizer keeps an own `__proto__` key rather than losing it to the prototype setter, or two docs differing only there would compare equal and skip a required PUT. Families unknown to the gateway are deferred while known ones keep projecting, and a deferral keeps the cached revision.

Lives in `src/docs/http-shadow.ts`. `agent_role` is a shadow family so the gateway lists roles without reading each job description through its pod. The last durable doc is cached as canonical key-sorted JSON so the boot seed is idempotent. Families a skewed gateway rejects as unknown are disabled per family, unlike the process-wide route skew latch, so a new view family does not stop the others. Puts are fire-and-forget; a deferral keeps the cached revision and warns. An undefined doc is a contract violation and throws rather than silently skipping. A conflict yields to the file.

### Doc family projection

Lives in `src/docs/project-family.ts` (`bootBindingId`, `singleAgentId`, `putFamilyDoc`). Zero agents at boot is normal on cloud pods (the tree may not have hydrated) and binds late; several agents wait for the gateway's first addressed request. `singleAgentId` is re-read each call because renames move directories. An absent family file projects the empty doc, or a deleted `routines.json` would keep firing through the external scheduler. Parsing is the pod's own tolerant `parseJsonDoc` (BOM strip, trailing-junk salvage). Families are projected normalized by the domain normalizers, so doc-served and pod-served answers are byte-equivalent; a non-object config reads empty.

### Doc shadow projector

Pinned by `src/docs/projector.test.ts`; lives in `src/docs/projector.ts` (`DocShadowProjector`).

The gateway serves projected docs to asleep readers, so each doc must equal what the pod's own read returns: entries the reader defaults or drops are projected the same way, an outside writer's partial trailing copy is salvaged as `loadJson` salvages it, and absent families project their empty doc.

Without a boot seed, the first projection binds and back-fills every family. A pod can reach the seed before its tree hydrates; zero agents must not poison or project, and the first watcher event binds and back-fills.

One agent per pod: when several directories exist (a rename leftover beside the live agent), nothing projects until the gateway addresses the live agent (`bindAddressed`, its registry engine id); events from any other directory, including ones appearing after boot, are refused forever.

The binding follows a rename (the rename request is often the wake that booted the pod), re-running the whole seed under the new name; `boundAgent` reflects it before the first projection so the view sink lands. A delete, or a leftover beside the live agent, is not a move it can follow.

A mangled family is reported by key while the others still seed, and the designed outcome never reaches the error channel.

Lives in `src/docs/projector.ts`. All I/O is serialized per family and contained so watcher delivery never waits or fails. The boot seed seeds revisions and then one content projection of every family, which makes agents whose files predate the shadow eligible for database reads and pool dispatch (otherwise only a family's first post-shadow change creates the doc, excluding the quietest agents); the skip-if-equal PUT keeps repeat boots at one GET per family. Refusals of foreign agents are the designed outcome, warned once per key. On rebinding, every family except the one in flight is enqueued so the missed seed still happens.

### View capture

Lives in `src/docs/view-capture.ts` (`attachViewCapture`, `VIEW_RESTS`). Engine-computed answers (providers, usage, skills, custom definitions) are published so the gateway can serve them while the pod sleeps; an asleep pod cannot change its answer, so the last capture is exact until the next wake (a cold `/providers` took 8 to 11 seconds). Skills ride the view path because they are a directory family. Route rests are resolved from the registry's own declarations, so a renamed route fails the import rather than publishing a 404 body. Only exact rest matches. Bodies over 4 MiB, non-200 or non-JSON abandon the capture without affecting the serve; there is no content-type gate because headers passed to `writeHead` are not observable via `getHeader` on every Node version.

### View warm

Pinned by `src/docs/view-warm.test.ts`. A woken pod's runtime may take its full 60-second boot budget, or fail and boot again, so the warm outlasts both. A runtime still not up after the window is the launcher's error already; the warm stands down with one breadcrumb per route. A view that answers 500 once the runtime is up, or a bare 503 without `Retry-After`, stays loud. The warm follows an agent renamed mid-window and stands down quietly when the host stops serving exactly one agent. A refresh that 404s for an agent no longer in the store (delete or rename unlinking its skills) is expected. Unrelated events never fetch.

Lives in `src/docs/view-warm.ts` (`warmViewDocs`, `refreshViewsOnEvents`). `WARM_BUDGET_MS` (3 minutes) covers a failed first boot plus a full second one, since a CPU-starved pod in a fleet-wide roll can exceed the 60-second boot budget (hydration alone exceeded 100 seconds). The boot warm GETs each view route once so a pod asleep since before view docs existed publishes them without a slow first client read; `/providers` relays to a runtime that takes about 10 seconds, hence retries. The agent is resolved on every attempt to follow renames. Same single-agent rule as the projector. A runtime still not up after the window is a breadcrumb, since the launcher already reported it and the previous doc keeps serving. Views are also refreshed on the domain events that invalidate them, debounced per view, so overnight changes reach asleep readers.

### Retire marker hydrate

Lives in `src/store-sync/daemon-hydrate.ts` (`runHydrate`). After a fence retire, local files the store held at the old boot's last sync but no longer lists were deleted elsewhere and are pruned; files the store never held are the old boot's own unsynced writes and are kept. Only plain relative store keys are removed. An unreadable marker keeps everything rather than prune on a guess.

### Store sync policy

Lives in `src/store-sync/daemon-policy.ts`.

`DEFAULT_MAX_HYDRATE_BYTES` is 9 GiB, leaving headroom in the pod's 10 GiB emptyDir for excluded scratch data.

`STORE_SYNC_EXCLUDES`: credentials and the local db, plus rebuildable toolchains and caches agents install in their workspace (`node_modules`, package stores, `.cache` browser downloads), which cost minutes per sync and are recreated from the setup script; excluded on hydrate too so a replaced pod starts clean. A `**/name/` entry never matches the workspace or agent folder itself, so an agent named "Cache" still syncs.

The tree watch degrades to the periodic pass when it cannot start or later fails (`onError` at most once, typically ENOSPC).

The final sync waits for any pass in flight so uploads never interleave. It retries with `FINAL_SYNC_RETRY_DELAYS_MS`, because it races the same deploy window that drains the pod and generation-guarded uploads get one fetch attempt; only exhausting the retries reports with an error.

### Retire prune

Pinned by `src/store-sync/daemon-retire.test.ts`. A retire restarts the container on the same emptyDir, and hydrate only overwrites what the store lists, so a conversation a pool op deleted while the pod was fenced would return. A retire marker names what the old boot had seen in the store; the next boot prunes those the store dropped and keeps the old boot's never-synced writes.

### Store sync daemon

Pinned by `src/store-sync/daemon.test.ts`. `flush` before start or after stop is a no-op. A user's own `.tmp` file is content and is synced. A file over the hydration cap is skipped with an err-less breadcrumb while others persist. Fence loss is reported once and is an info breadcrumb (an entry with an error object becomes a Sentry error). Transient failures are absorbed as err-less breadcrumbs with the cause inlined; a sustained streak reports with the error attached; recovery resets the streak. The lease heartbeat starts at hydrate so a long hydrate never makes the boot look stale. Tests use a short periodic interval because macOS FSEvents subscriptions activate asynchronously, and generous polling deadlines for watcher timing under load.

Lives in `src/store-sync/daemon.ts`. The daemon owns the synced root so the drain handshake never recomputes it. `hydrate` returns the restored object count for boot telemetry. `flush` syncs now for writes another party reads back immediately (the gateway's bridge binding check reads `custom-endpoint.json` right after the desktop probes), since the watcher skips the workspaces subtree and the periodic pass is 5 minutes out; it is a no-op before start, after stop or once fenced. `syncAfterWrite` ships an acknowledged write under the lease just checked, only while the boot carries a lease token. Once fenced, the sync halts for good and the fence's heartbeat keeps watching.

### Predecessor drain

Lives in `src/store-sync/predecessor-drain.ts` (`publishDrainStamp`, `retireDrainStamp`, `waitForPredecessorDrain`). The stamp is pushed with an explicit flush, because the watcher debounce and the 5-minute pass both lose the race to the already-booting replacement; publishing never throws. The shutdown waits at most `DRAIN_STAMP_FLUSH_WAIT_MS` (20 seconds) for that flush, since runtimes only get SIGTERM after it, and the final sync serializes behind a flush still running. The boot polls every 10 seconds, trims the last sleep to the deadline, and never waits past `DRAIN_WAIT_MAX_MS` (10 minutes, beyond any termination grace), so a skewed or garbage stamp cannot wedge it. No stamp, expired, unreadable stamp or unreadable store all proceed at once; only a missing object is the quiet case. A stamp removed mid-wait means the predecessor finished.

### Shared mirror controller

Pinned by `src/store-sync/shared-mirror.test.ts`. Uploads are recorded after the body is read to avoid a visible-but-stale window. Because macOS FSEvents subscriptions start asynchronously and the controller has no periodic fallback, tests retouch files with identical bytes (hash-skipped, so no extra uploads) until the push lands.

Lives in `src/store-sync/shared-mirror.ts` (`SharedMirrorController`). Wake hydration starts without making readiness wait on remote storage. `beforeTurn` refreshes before a turn, joining wake work and debouncing probes. A single-flight probe updates its baseline only after complete reconciliation, so a failed partial pass is retried.

### Upload files and commit

Lives in `src/store-sync/upload-files.ts` and `src/uploads/commit.ts`. The baseline and copied files change in the same queue as sync-back, and a file is hashed before publishing so the agent's later edit stays a local change. The whole batch is resolved before any destination is written. Folder uploads carry `relPath` (like `webkitRelativePath`) and land at `uploads/<relPath>`.

### Write fence

Lives in `src/store-sync/write-fence.ts`, pinned by its test. Once lost, the fence latches (no more asks, one notice, even after a sync 409). Against a live holder the pod stands down and retires only when the holder goes stale, so two engines never trade the lease through restarts; stale is final and stops the heartbeat. A "held" answer is never cached. A store without the check route (rolling deploy) is asked again on later writes and never turns a stand-down into a retire. The heartbeat finds a takeover on an idle pod with no write. A check sent before a takeover cannot classify a later sync 409. A boot without a lease token (fencing off) never calls the check or heartbeats until a token is captured from a write or a read; a token-less boot whose sync meets a 409 knows the store fences it and watches the holder from then.

Lives in `src/store-sync/write-fence.ts` (`WriteFence`). A pod learns of a takeover from a sync 409 or the lease check; the sync alone misses an idle superseded pod, which answered writes 200 and lost them at recycle. The check runs before an agent-data write is acknowledged and on a 60-second heartbeat. `writable` shares one check among concurrent callers; an unreachable store or one without the check answers true, like any write during a store outage. The heartbeat starts right after the boot's claim (a held check renews the lease) and runs with no I/O until a token exists. After the loss, `onHolder` reports `live` at most once, then `stale` at most once, never `live` after `stale`; a check already in flight when the loss happened cannot classify; "held" after the loss still means a halted sync and retires; "unsupported" decides nothing during a pod-store roll.

### Smaller rules

`src/store-sync/daemon-log.ts`: sync failures report with the error only after 3 consecutive failed passes (about 15 minutes); a lone failure is a deploy-window blip and a breadcrumb. Fence loss carries no error object, since it is a designed outcome.

`src/docs/wire.ts`: stable stringify with a null-prototype object so jsonb reordering and `__proto__` keys never misread. A non-empty non-JSON doc GET throws, since treating it as revision 0 would mask corruption and follow with a blind PUT. An unknown-family 400 is deploy skew; other 400s are wire bugs.

`src/store-sync/drain-stamp.ts` (`DRAIN_STAMP_FILE`): the replacement pod is created about a second after SIGTERM while the old pod drains for minutes, and hydrating inside that window settles a live turn and loses its reply. The stamp lives at the sync root (its relative path is its store key) and must be matched by neither exclude list so it rides normal passes. A finished drain expires the stamp instead of deleting it, so uploads are never held by delete-pass rules and a hydrated stamp is inert; a missing stamp is written expired. Anything but two finite epoch numbers is not a stamp.

`src/docs/shadow-put.ts`, `shadow-seed.ts`, `shadow-fetch.ts`: one conditional PUT with a single adopt-and-retry on revision conflict; a conflict yields to the file; 404 on seed is revision 0; unknown family latches; unavailability (5xx or no answer through retries) defers with a warning; anything else fails the seed loudly. Fetch retries 5xx and thrown failures with a fresh abort signal per attempt.

`src/store-sync/excludes.test.ts`: any-depth excludes must name exactly one directory (`**/<dir>/`); other `**` shapes would silently match nothing.

`src/pod-gateway.ts` (`capturePodFence`): a pod-store replica publishes its cached token up to 2 seconds old, so a captured token never moves backwards.

`src/store-sync/sync-schedule.ts` and `coalesced-run.ts`: the daemon syncs after a watcher debounce and on a periodic pass covering what the watcher skips; one pass at a time, a request mid-pass schedules exactly one more (the tree may have changed), cancellable when moot.

`src/docs/doc-publisher.ts`: publish results are `landed`, `deferred` (a later publish can land it) or `unsupported` (pointless to retry until restart); the reporting put exists for callers that announce a document only once the gateway can serve it.

## Pool worker ops

### Pool worker op dispatch

Lives in `src/op/dispatch.ts` (`dispatchAgentOp`). A write the gateway routes to a pool worker instead of waking the pod runs the same route handlers against a hydrated copy of the agent's workspace over a loopback server, so semantics are identical by construction. Unknown routes answer 404. `agentMissing` makes the worker decline so the gateway proxies instead. `tooLarge` and `privateRefused` flag refused binary answers or lazy reads; a refused lazy read answers 503 from inside the chain and tells the caller to discard the overlay rather than sync a partial mutation. Binary bodies travel base64. GET and HEAD carry no body (fetch throws on any, and the gateway always sends an empty string). The query rides the loopback URL so handlers see what the pod sees. Emitted events are returned for the caller to republish docs. The verified acting sub, AI Manager provenance, plan floor and display name are passed in from the gateway envelope.

### Pool op handler chain

Lives in `src/op/handler-chain.ts` (`runAgentOpChain`). The pod's own per-agent handlers over a hydrated copy: Files byte-identical to the pod; composer attachments land in `uploads/` before the send (a pool turn); migration imports synthesize pi sessions on the worker's tree unless `sessions=0`, and stamp routines with the op's verified actor. Unknown routes answer 404.

### Op surface

Lives in `src/op/op-surface.ts` (`OP_EXCLUSIONS`, `OP_CHAIN`). The per-agent groups a pool worker does not answer, each with its reason; everything else in the registry's agent segment is served in chain order, and the record has no slot for a new group's handler until one is written, so pod and worker cannot drift silently.

### Pool routine run cancel

Lives in `src/op/routine-run-cancel.ts`. A pool worker serves only the stop; firing starts a turn, which the gateway dispatches as a pooled turn, so `routines/:id/run` is left to the 404. The gateway already stopped the sandbox by releasing the claim, so the stop is the row alone, answered as the pod answers. With `stopped` (whose session key must be one of the routine's two conversations) the gateway vouches the run was live, so a missing row is recorded.

### Smaller rules

`src/op/dispatch-relay.ts`: only the handlers' own JSON rides as text; downloads and archives are always bytes (base64), since text decoding would re-encode a Latin-1 CSV. Oversized binary bodies are refused before buffering so the gateway answers unavailable rather than wake a pod; a private-directory refusal says so, never "too large".

`src/op/op-handler.ts`, `handler-chain-parity.test.ts`: an op handler's answer is the chain's unchanged (anything but `false` answered). The pool op chain is derived from the registry's agent segment minus the groups a worker cannot answer, so a route added to one list cannot 404 as an op.

## Boot migrations

### Flat layout migration

Lives in `src/migrate/agent-layout.ts`. Ported from the Rust engine's `migrate_agent_data`: `.houston/<f>.json` becomes `.houston/<f>/<f>.json` for activity, routines, routine runs and config; `.houston/memory/learnings.md` bullets become `learnings.json` entries; the old seeded prompt files are deleted. Idempotent (old exists and new missing), originals kept as a rollback net, atomic writes. Only agents with an existing `.houston/` directory are touched; a `.houston` that is a file fails that agent only. Legacy model aliases need no rewrite; `provider-model.ts` maps them at read time.

### Schema reseed

Lives in `src/migrate/agent-schemas.ts`. Seeded schemas are app data, and every family schema is `additionalProperties: false`, so a stale copy tells the model to strip host-stamped fields (provenance keys). Every family is rewritten only when content differs (zero writes and zero watcher churn at steady state), logged once per agent, and only for agents with a `.houston/` directory; failures are per agent.

### Agent store migrations (pool worker)

Lives in `src/migrate/agent-store.ts` (`migrateAgentStore`, `AGENT_STORE_MIGRATION_VERSION`, `AGENT_STORE_MIGRATION_PATHS`). The boot migrations for one agent's hydrated store tree, run by a pool worker's `migrate` op where no pod boots. Bump the version whenever a migration is added or changes what it writes; the gateway records each agent's version and reruns the op for agents behind it, and the cloud mirrors the number as `pooldispatch.StoreMigrationVersion`. The test fails when a boot migration is neither covered nor listed in `HOST_ONLY_MIGRATIONS` with a reason. Every path a step reads or writes is in `AGENT_STORE_MIGRATION_PATHS`, the only files the op hydrates (`op-migrate-tree.ts`), and the migration over those files alone must equal the migration over the whole agent. Steps run in boot order; per-agent steps throw so the version is not recorded, except a routines doc that is not JSON (left to the read path). Workspace-level steps keep their boot posture. `OneAgentStore` hides every other folder in the workspace.

### Rust-era chat history migration

Lives in `src/migrate/chat-history.ts`, `reconstruct.ts`, `linkage.ts`, `types.ts`, `sqlite.ts`.

The Rust app stored chat outside the agent tree in `~/.houston/db/houston.db` (`chat_feed`); the host stores it per agent under `.houston/runtime/`. Strictly additive and idempotent: only new files under `.houston/runtime/` are written; the source db (opened read-only) and existing tree files are never modified. A live-data test must copy the db with its `-wal` and `-shm` sidecars.

No per-agent marker: a per-conversation existence check makes re-runs no-ops, because a wholesale marker once lost every chat a Rust-era build wrote after it was stamped (old and new apps interleave, and the migration wizard's source host stamps first). Legacy markers are ignored.

Linkage: activities do not carry session ids. The tracker files `<agentRoot>/.houston/sessions/<provider>/<session_key>.sid` (one id, no trailing newline) and `.history` (one per line, rotations) map a `session_key` (the conversation id, so board cards link to the migrated transcript) to claude session ids, unioned across provider directories and files. Rows are merged across ids by timestamp then row id (unparseable timestamps sort as 0).

Orphans (chat_feed ids no tracker references, from deleted activities) are counted and logged, never migrated (there is no agent column) and never silently dropped.

Fidelity split: the transcript renders the full feed (user, assistant, tool calls and results, thinking, file changes, final result, and unknown types); the pi session gets only user and assistant text pairs, since tool and thinking blocks cannot transfer between engines. A turn's assistant text is its `final_result`, else the concatenated `assistant_text` chunks since the last user message.

`SessionManager` is imported directly from `@earendil-works/pi-coding-agent` (already a host dependency) so the host need not depend on `@houston/runtime`. pi persists a session only once it holds an assistant message. Message literals mirror what the runtime's resume test proves restores through `continueRecent()`. Sessions are anchored at the agent root for the right cwd.

`IMPORTED_HISTORY_NOTE` is the final user message of every imported session, timestamped at the last imported message: a migrated "delete all of your routines" thread made an agent wipe freshly migrated routines on its first turn.

Transcript types mirror the runtime's `ChatMessage` and `StoredConversation` and are re-declared because the file is written directly.

`sqlite.ts` wraps `bun:sqlite` and `node:sqlite` because the host runs under Node in dev, tests and Docker but under Bun in the packaged sidecar; the seam stays narrow (`run`, `query().all`, `query().run`, `close`).

`agentRoots` lists exactly the agents LocalWorkspaceStore lists (dot directories and the preferences namespace skipped).

### Gateway group notes

Lives in `src/migrate/gateway-group-notes.ts`. Cloud engine pods hydrate a `GROUP.md` the gateway wrote from team context; nothing uses them now, so a gateway-fronted engine pod deletes them once per workspace (a marker makes it one-shot, so later notes stay). Desktop and self-host never run it, since a `GROUP.md` there is the person's own. Failures leave the marker unset for the next boot.

### Legacy setup directive

Lives in `src/migrate/legacy-setup-directive.ts`. Removes the retired onboarding's "send ONE real email now" section (`packages/domain/src/legacy-setup-directive.ts`) from every `CLAUDE.md` at boot, where files are local, so pods upload the cleaned file and no client wakes a pod for it. Only files carrying the section are rewritten, with unique temp files; failures are reported per agent.

### Routine creator backfill

Lives in `src/migrate/routine-created-by.ts`. The control-plane planner refuses to fire a routine with no creator, so old routines would stop once pre-wake suppression turns on. The planner's snapshot is projected from this file on the next upload, so stamping is the whole repair. The stamp is the org owner's real user id, because fire-time delivery requires the acting identity to equal `created_by` and only a real user can be minted a token. Only entries without a non-empty creator change; malformed entries and non-array docs round-trip untouched for the read path; a doc with nothing to stamp is not rewritten; output uses the canonical JSON form (`jsonDoc`). Per-agent failures are logged and skipped.

### Sidebar layout migration

Lives in `src/migrate/sidebar-layout.ts` and `sidebar-layout-notes.ts`. Stored layouts convert to v2, normalizing legacy and malformed documents so every named group survives. The `GROUP.md` notes legacy groups mirrored are recorded as `sidebar_layout_legacy_notes` in the same write, so their removal survives crashes and retries every boot until done; the marker is cleared only if no newer conversion replaced it. A note still holding exactly the mirrored text is deleted; an edited one is the person's and stays. A malformed marker throws so boot reports it.

## Providers and model catalog

### API-key provider gate

Pinned by `src/providers.test.ts`. `isApiKeyProvider` is derived from pi: any pi provider that is not OAuth accepts a pasted key, so providers never hand-listed (groq, mistral, xai and others) connect. pi's OAuth providers route to sign-in; unknown ids are refused because no turn could resolve them. GitHub Copilot is registered for its OAuth relay but kept off the cloud per-turn runtime (its sandbox does not allowlist the Copilot host). openai-compatible has its own route and is never offered by the cloud runtime.

Lives in `src/providers.ts` and `src/providers/types.ts`. Everything outside `providers/` imports the provider surface from the facade. `cloud` gates only the legacy Cloud Run listing (Anthropic stays off there by its terms); curated `models` feed that listing (Codex gets its list injected; the standing path relays the runtime's own list); `defaultModel` is the listing's active model when settings have none.

### Anthropic and MiniMax lineup rows

Lives in `src/providers/anthropic-catalog.ts` (`withAnthropicLineup`) and `minimax-catalog.ts` (`withMinimaxRetired`). The `anthropic` provider runs one model per Claude family (`ANTHROPIC_LINEUP`) and the runtime runs other Claude ids on their family's lineup model, so retired rows stay listed with `runsAs`, which the gateway's clamp and the app read, so an allowed-models ceiling written with a retired id still admits what it runs as. Familyless rows (`claude-2.1`) are dropped because nothing runs them. Other providers' Claude rows are untouched. MiniMax's retired ids carry `runsAs` the default the same way, hidden from pickers by the app; `MiniMax-M3[1m]` is cloned from the default row since pi never shipped it.

### Bedrock catalog

Pinned by `src/providers/bedrock-catalog.test.ts`. Bedrock rejects bare ids ("on-demand throughput isn't supported") and off-region profiles ("model identifier is invalid") on a valid key, so those are dropped; ids confirmed working on a plain key survive; the curated list and connect default never name an id the catalog no longer serves.

### Mission pin facts in the catalog

Lives in `src/providers/catalog-pin.ts` (`withMissionPin`). Each catalog provider is stamped with what `start_mission` pin resolution reads (`catalogFor`'s curated name and `resolveMissionModel`'s spoken-name rows), because the hosted gateway resolves a sleeping agent's pin from this catalog.

### Host provider catalog

Lives in `src/providers/catalog.ts` (`PROVIDERS`). The runtime owns full model lists; the host only needs which providers exist, how they authenticate and which the legacy Cloud Run per-turn path offers. `cloud: false` means off that legacy listing only; such providers are served everywhere else through the full pi catalog. `defaultModel` reads the domain's `DEFAULT_MODEL` so a hosted turn never starts on a model the picker does not offer (pinned by its test). Bedrock Claude ids are `global.` inference-profile ids, since Bedrock serves Claude 4.x only through inference profiles. MiniMax M3.1 Flash leads because both key kinds run it. The openai-compatible provider is local-profile in this catalog, gated by the `openaiCompatible` capability, with config owned by the runtime.

### Headline model guards

Pinned by `src/providers/claude-5-5-catalog.test.ts`, `opus-5-catalog.test.ts`, `fable-5-1-catalog.test.ts`, `gpt-6-catalog.test.ts`, `azure-provider-id.test.ts`. Headline rows ship in pi's baked catalogs, and a pi bump that dropped or reshaped one would silently strip it from `/v1/catalog` (a picker once shipped with no models). Effort ladders follow pi's maps (minimal nulled on the 5.5 family, only Haiku can turn thinking off; Opus 5 can turn it off again in pi 1.3.0; Fable has no off level). Retired Fable rows keep their metadata and name their successor. pi 1.0.3 renamed Azure to `azure`, but Houston's wire, gateway rows, ceilings, stored pins and older clients key on `azure-openai-responses`, so a pi patch reverts the rename; both host listings are pinned to the Houston id.

### Model catalog

Lives in `src/providers/pi-catalog.ts` (`buildProviderCatalog`, `piModelToCatalogEntry`, `piProviderToCatalog`).

`GET /v1/catalog` is pi-ai's full baked registry on every deployment: the managed pod runs the local-profile host and runtime and its egress reaches every provider's public 443 endpoint, so hosted users see every provider. Deterministic, no network. Mappers are pure for testing.

pi-ai's legacy `getModels`/`getProviders` reads are used from `/compat`, because the new collection API needs an instantiated registry. `BuiltinProvider` excludes purely dynamic providers with no static entry.

Thinking levels come from `getSupportedThinkingLevels`, which honors levels marked unsupported and the xhigh rule; non-reasoning models get no selector. Vision is `input` including `image`.

Display names use pi-ai's OAuth names when present, else a titleized id; the frontend owns brand labels.

Shaped providers: Bedrock drops ids Bedrock refuses (`bedrock-catalog`), Anthropic's retired rows name the lineup model they run as (`anthropic-catalog`), MiniMax's retired ids name the default (`minimax-catalog`; `MiniMax-M3[1m]` is Claude Code's client-side marker that MiniMax rejects). A team ceiling written with a retired id still admits through `runsAs`. Providers with no chat model are skipped. Houston's DashScope qwen provider is appended explicitly.

The GPT-6 line ships natively in pi-ai; Luna (the Codex default) maps off to the API's `none` effort, while Astra has no off level and a 272k standard window that the protocol's window overrides snap to 1M.

### OAuth providers

Lives in `src/providers/pi-oauth.ts` (`piOAuthProviders`). Houston connects anthropic, openai-codex and github-copilot by subscription sign-in. Since pi 0.81 many API-key providers also expose optional OAuth (xai, kimi-coding, openrouter), so "has OAuth" no longer means "connects by OAuth"; the set is OAuth-only providers plus the two curated subscription providers that carry a vestigial API-key resolver.

### Provider copy

Lives in `src/providers/provider-copy.ts`. Users are non-technical, so provider names in sentences come from the catalog, never pi's ids. The catalog's plan parenthetical is dropped mid-sentence only. An unknown provider keeps its id rather than an empty sentence. Both firers throw the same routine-unavailable sentence so run history reads as one.

### Smaller rules

`src/providers/lookup.ts`: `LOCAL_PLACEHOLDER_KEY` mirrors the runtime's constant for keyless local servers (pi requires some key; the packages share no code). `CLOUD_PROVIDERS` and `isCloudProvider` feed only the legacy Cloud Run path; managed pods serve the full catalog. `isTurnServable` separates the overloaded `cloud` flag: openai-compatible is servable when an endpoint is configured though it stays out of the picker; the boolean is passed in to keep it pure. `KNOWN_PROVIDER_IDS` mirrors the runtime's `isProvider`, so a runnable pin is never refused as unknown.

`src/providers/catalog-pin.test.ts`: catalog pin facts must say what the host's own resolver reads, because the gateway resolves a sleeping agent's mission pin from them; the local endpoint is listed under the exact name the gateway uses (`missionpin.go localEndpointName`); retired Claude rows never resolve; curated order matches the gateway's `curatedProviderOrder`.

`src/providers/qwen-dashscope.ts`: Qwen on Alibaba Model Studio's international pay-as-you-go endpoint, for free-quota keys the pi Token Plan gateways reject with 401. Both twins derive from pi's `qwen-token-plan` table, so they cannot drift. The default model is listed first so first-model reads pick it.

`src/providers/api-key.ts` (`isApiKeyProvider`): derived from pi's registries (plus Houston's qwen), not the curated host catalog, which used to block every other pi provider; computed once at load because the sets are baked. pi's OAuth providers (anthropic, openai-codex, github-copilot) are excluded; openai-compatible is not a pi id.

`src/providers/bedrock-catalog.ts`: pi lists about 120 Bedrock ids, most refused on demand, and the picker's shortest-id dedupe (`app/src/lib/providers.ts`) would choose a broken one. Bare `anthropic.claude-*` ids fail (Claude 4.x runs only through inference profiles) and regional profiles exist only in their region, so only `global.` profiles and Amazon's `amazon.` Nova models are kept, in catalog order.

`src/providers/catalog.test.ts`: no catalog entry may restate a default the domain owns.

`src/providers/qwen-dashscope.test.ts`: the first model must be the Qwen flagship, since first-model reads pick it.

## Product prompt

### Prompt sections and mirrors

Lives in `src/houston-prompt*.ts`, pinned by `houston-prompt-mirrors.test.ts`. The desktop ships its own copy of every section in `app/src-tauri/src/houston_prompt/` and hands it to the host as `HOUSTON_APP_SYSTEM_PROMPT`; each Rust section is a raw string literal, so the test compares bytes whole (the desktop's routines copy is the event-capable variant), and a wording change on one side fails until made on the other. The prompt is re-sent on every model request, so it carries only what must hold before any tool runs; tool mechanics live in tool descriptions and results (the runtime's `context-budget.test.ts` caps its size). The host is prompt-agnostic and only injects it as `HOUSTON_SYSTEM_PROMPT`; this is the built-in default. The Connected Apps section leaves per-status speech acts and account choice to the search result and custom setup steps to `custom_integration_detect`'s result. The Missions section (start, monitor, move finished missions) must be kept in sync with `missions.rs`.

### Skills prompt mirror

Lives in `src/houston-prompt-skills.ts` (`SKILLS_GUIDANCE`), pinned by its test. The desktop ships its own copy in `app/src-tauri/src/houston_prompt/skills_memory.rs`; the two drifted before (the host lacked the `integrations:` frontmatter field), so the test diffs the whole Rust raw string against the TypeScript constant, minus the one desktop-only bullet (the `Use the <skill> skill.` prefix), which is asserted present first. Content pins catch a loss from both copies: the `integrations:` field, the saved-step action tag (so a step runs straight away), keeping the app-written `industry` and `role` block when the agent rewrites `CLAUDE.md`, never naming the integrations provider, and no em dashes. The self-editing instructions section has no Rust mirror.

### Product prompt

Pinned by `src/houston-prompt.test.ts` (a port of the Rust prompt's assertions in `app/src-tauri/src/houston_prompt/mod.rs`). Load-bearing content: routines are saved with `save_routine`, never by writing `routines.json`; the mission tools with standalone prompts (the child cannot see the parent conversation), depth 1, and never moving the current mission; the `industry` and `role` block the agent must keep; inferred learnings are offered at end-of-task reflection; the connect card is a tool; a blocked app is described as turned off for this agent and fixable in its Settings under Apps; changing app actions are confirmed up front with one `ask_user` question branded by the app, never for read-only actions; no "+ button" (channels have none); the learn-preferences opt-in goes through `ask_user`; one batched `ask_user` call; the event-wake variant only where triggers fire, steering otherwise to Houston Cloud without naming the provider; a cloud agent's `/tmp` is the pod's, not the workspace's; employees resolve "Houston" to the manager without claiming the name, and app actions are never voiced as Houston acting; one sentence before the first work tool, because most turns ran tools before any text and the user waited about 22 seconds. Mirrors are compared after normalizing Rust string escapes; whole-file parity is not used because of an existing dash divergence.

### Smaller rules

`src/houston-prompt-base.ts` (`BASE`): byte-identical to `app/src-tauri/src/houston_prompt/base.rs`; each rule stated once; tool mechanics live in each tool's own description.

`src/houston-prompt-routines.ts` (`routinesGuidance`): event wakes need a trigger backend (Houston Cloud only), so where they are off the prompt describes schedule wakes only and steers event requests to Houston Cloud or a schedule, or the agent would create automations that stay silently dead.

## Local host profile

### Local host profile

Lives in `src/local/` (`host.ts`, `host-server.ts`, `host-runtime.ts`, `main.ts`).

The same server driven by the local adapter profile (LocalWorkspaceStore, FsVfs, LocalPaths, SingleUserVerifier).

`main.ts` is the desktop sidecar entry: the shell parses the `HOUSTON_HOST_LISTENING` banner for port and token. Environment (all optional): `HOUSTON_HOME` (default `~/.houston`), `HOUSTON_WORKSPACES_ROOT`, `HOUSTON_CREDENTIALS_PATH`, `HOUSTON_AGENTS_DIR`, `HOUSTON_CHAT_HISTORY_DB` (Rust-era chat to migrate), `HOUSTON_HOST_PORT` (4318), `HOUSTON_HOST_BIND` (127.0.0.1; self-host sets 0.0.0.0 behind a TLS proxy), `HOUSTON_HOST_TOKEN` (random per boot unless fixed), `HOUSTON_CREDENTIALS_URL` plus `HOUSTON_ORG_SLUG` and `HOUSTON_AGENT_SLUG` (managed pod org credentials), `HOUSTON_RUNTIME_COMMAND` (explicit runtime argv; otherwise the compiled sidecar spawns itself in runtime role via `HOUSTON_SIDECAR_ROLE`, Docker spawns `dist/runtime/main.mjs`, dev runs the runtime through tsx), `HOUSTON_APP_SYSTEM_PROMPT`, `HOUSTON_MANAGED_CLOUD=1`, `HOUSTON_SHUTDOWN_DRAIN_MS` (termination grace minus the final sync's share), `HOUSTON_OAUTH_CALLBACK_BASE_URL` (self-host custom OAuth callback origin), `HOUSTON_PASSIVE=1` (migration source: no scheduler, no watcher), `HOUSTON_ROUTINE_SCHEDULER_MODE` (`local` or `external`, which disables cron fires and keeps reconcile), `HOUSTON_STORE_URL`, `HOUSTON_TRANSCRIPT_DUAL_WRITE=1`, `HOUSTON_TURN_LOG=1`.

Sentry is dormant without `SENTRY_DSN` (source runs also need `SENTRY_SEND_IN_DEV`). Console capture mirrors the Rust engine: every `console.error` is a Sentry event and info and warn are breadcrumbs, so error sites report without per-site wiring. An absent credential is announced with its remedy.

A partial org-credential env is always a deploy bug: falling back to the empty file store would read as an org-wide logout and could start rotating refresh tokens locally, so the boot dies loudly. Hydration is a boot invariant in store-backed mode; failure exits non-zero so the orchestrator retries with a fresh emptyDir.

`triggersEnabled` is true only on a managed pod (Composio project key plus public webhook URL), and drives the prompt's event wakes, the write gate and trigger status. The Go control plane owns trigger reconciliation and ingress; the host only serves the delivery route, deduped by the turn bus lock.

The turn log uses its own fence copy and never mutates the object store's lease fence.

The unserved set is frozen at boot, since the route table cannot change, so every runtime is told exactly what the dispatcher enforces.

Per-runtime env is built per spec so the assistant role reaches only the coordinator's process. The coordinator is decided by the host (a managed pod's assistant is an ordinary agent whose directory says nothing). Managed pods pass bridge coordinates so runtimes can reach the local-model bridge the gateway fronts.

Stale-id fail-closed resolution and the setup-runtime carve-out live in `agent-dirs.ts`.

Connect-once locally too: keyless runtimes fetch fresh tokens from the host. The acting header is relayed to runtimes only when gateway-fronted. Anthropic is served back only behind the gateway. Forwarded sends keep the gateway's timezone stamp; host-built fires use the pod zone.

`draining` is raised at the top of `stop()` so heals answer 503 with `Retry-After` for the rest of the drain.

The healer's capture is `localOriginOnly` (refresh-bearing OAuth and API keys the runtime attests were not serve-written) and `ifAbsent`, because a plain PUT is reserved for real user connects (it clears the gateway's revocation tombstone) and an automatic re-push of a leftover copy would resurrect a revoked credential.

`chatHistoryMigrated` on `/v1/version` is true when the Rust desktop chat db exists: those users kept agents and history but not provider credentials (different OAuth client), so the UI guides one reconnect and remembers it was shown. An unreadable db still counts.

The agent-config library's FsVfs is rooted at the library's parent, because FsVfs keys must be non-empty.

`ensureSyntheticAgentDir` goes through `liveAgentDirFor`, the one place allowed to create a directory with no create path behind it.

`/metrics` is token-gated like every non-public route.

Model-call timings from the settle report are forwarded to the gateway on managed pods.

Cloud pods publish view-route answers to the managed doc store (`view-sink.ts`) so the gateway can serve them while the pod sleeps, and re-capture them on the domain events that invalidate them.

Capabilities: the custom provider is always on; Composio depends on config; when both a gateway URL and a key are configured the gateway adapter wins. Before sign-in the desktop gateway adapter is present but signin-gated, never a 503. The local profile serves its own custom OAuth callback; pods cannot receive the redirect until the gateway serves it. An unfronted host serves the morning briefing; a fronted pod does not. Pods run bash in the single-tenant container and offer the full provider set plus a validated BYO endpoint.

Managed pods point every runtime at the pod-local org mirror, never the desktop `.shared` tree. A start flag pre-spawns runtimes; without it nothing spawns until a dispatch asks.

### Synthetic agent directories

Lives in `src/local/agent-dirs.ts` (`agentDirFor`, `liveAgentDirFor`). A synthetic agent has a dot-prefixed id segment (`.setup/connect`, `.assistant`); `.` and `..` are excluded so a relative segment cannot claim the carve-out. `liveAgentDirFor` fails closed on a stale id (after rename or delete the old directory is gone, and spawning there would recreate a ghost agent), except for synthetic agents, which have no create path and must be created here; otherwise first-run connect on a fresh cloud account fails before any agent exists. Idempotent, since discovery runs every boot.

### Fence retire

Lives in `src/local/fence-retire.ts` (`respondToFenceLoss`). A pod that lost its write lease can never persist again. `live` (another running engine owns the agent): reclaiming would make the two trade the lease through restarts, so the pod stops its schedule and runtimes, keeps refusing writes and waits. `stale` (nobody writing): the pod exits non-zero; the kubelet restarts it in place, it waits out any predecessor drain, claims a fresh lease and hydrates, so the agent converges on one writer. Runtimes get `FENCE_RETIRE_DRAIN_MS` (3 seconds, short because a reply this pod cannot keep should not be shown), and the whole retire is capped at 20 seconds. One structured line per retire keyed by agent, so two within minutes can alert.

### Fenced pod writes

Pinned by `src/local/fenced-pod-writes.test.ts`. A write a pod acknowledges must be a write the agent's next pod reads. A pod superseded while idle refuses edits before they touch disk (503) and retires, and an idle superseded pod retires on its own heartbeat. When the newer holder is a running engine, the pod stands down (readiness 503, every sandbox family refused, the gate running ahead of them all) without reclaiming the lease, and retires once that engine stops. An acknowledged edit is uploaded right after the answer, so a takeover minutes later cannot lose it.

### Served capabilities

Lives in `src/local/host-capabilities.ts` (`servedCapabilities`). Integrations list what is actually wired. `customIntegrationOAuth` is on exactly when a reachable callback exists. `triggers` is never advertised by this host (absent means off); the Go edge advertises it on managed cloud.

### Host daemons and lifecycle

Lives in `src/local/host-daemons.ts`, `main-lifecycle.ts`, `host-log.ts`, `host-files.ts`.

FsWatcher catches direct edits by the agent or user. Upload staging excludes the workspaces subtree from its own watch, since FsWatcher already covers it.

Managed pods sample their own busy state (the gateway only sees awake from outside) using the activity logic minus open requests, because an open tab's subscription keeps a pod awake but is not the agent working.

The supervisor never dies on a stray child error, dropped socket or transient fetch. Node's Linux recursive-watcher ENOENT race on a transient directory (`watch/watcher-race.ts`), thrown or rejected, is demoted to a warning.

With `HOUSTON_SUPERVISED=1`, EOF on piped stdin (the app force-quit or crashed and sent no signal) tears down the host and runtimes so nothing is orphaned; Windows uses the supervisor's kill-on-close Job Object. Queued Sentry events are flushed on stop.

`severityLog`: daemon entries with an error go to stderr (Sentry events), others to info (breadcrumbs); routing everything to `console.error` made boot lines into Sentry issues.

### Host heartbeat

Lives in `src/local/host-heartbeat.ts`. The morning briefing runs on the open host only; a gateway-fronted pod would brief from a partial view. It starts and stops with the routine scheduler and uses the synthetic directory carve-out.

### Integrations wiring on the local host

Lives in `src/local/host-integrations.ts`. The desktop holds no provider key; the gateway adapter forwards with the Supabase session the frontend keeps fresh. A leftover `integrations.json` from the retired per-user model means the user's old connections are gone; the one-time reconnect notice is shown (their old personal key is no longer used) and dismissing it deletes the file, re-checked live. The custom provider is wired unconditionally (key-free, definitions next to the credentials file). Custom OAuth is offered only where a browser can reach the callback: the loopback desktop derives its own base, self-host sets a public origin, managed pods stay off until the gateway serves it; a pod's callback is the gateway's public route, which routes by the `<org>.<agent>.` state prefix.

### Drain stamp handshake

Pinned by `src/local/host.test.ts` and `managed-store-config.test.ts`. An evicted pod keeps draining its turn while the replacement boots. On stop it uploads a drain stamp (drain budget plus exit slack) with its drain flush, and its final sync ships the stamp closed. A replacement waits on an open stamp before claiming the write lease, because claiming first would fence the predecessor's final sync; an expired stamp is inert. The stamp read captures the predecessor's token, which is not this boot's to present. A gateway without fencing answers the claim 404; the boot carries no token and nothing waits on the lease check until a read publishes one. Batch store reads are opt-in for the per-turn worker only.

### Local host options and boot

Lives in `src/local/main-host.ts`, `host-options.ts`, `host-managed-options.ts`, `host-start.ts`, `host.ts`, `host-migrations.ts`, `host-base.ts`.

The installed agent-config library is the Rust engine's tree, carried over. The chat-history migration defaults to the canonical db path and is a no-op when absent or done; the db is the live one, opened read-only, and must be safe to read while the app holds a WAL lock.

Bind defaults to `127.0.0.1` so nothing on the network can drive the desktop's agents. Self-host binds `0.0.0.0` behind a TLS proxy, with the boot token gating every request.

The banner token is redacted when it came from the environment or on a managed pod, so it never lands in plaintext logs; the desktop sidecar's per-boot token is printed because its supervisor (`engine_supervisor.rs::parse_banner`) reads it back. The redacted form uses `token_fp=` (first 8 characters) and `token_len=` so nothing mistakes it for a token, and keeps the `HOUSTON_HOST_LISTENING port=` prefix the readiness greps match.

Managed pods pre-spawn runtimes after listen (`HOUSTON_EAGER_RUNTIME=1`) so the roughly ten-second runtime boot overlaps the wake, sequentially (one agent per pod, and no CPU stampede); the desktop never does, to spare laptop resources. The spawn is fire-and-forget after the banner so `/health` never waits on it, and the boot report waits for it because it is the slowest step.

The built-in system prompt is the default when the app supplies none; event wakes are advertised only where triggers fire.

`externalRoutineFires` is set only in the managed topology (the pod-store env is its marker), not self-host, which sets `HOUSTON_MANAGED_CLOUD` with no control plane. The control plane's delivery carries the creator's minted identity, so local cron fires wait out `EXTERNAL_FIRE_GRACE_MS` and the local scan is only a backstop.

`gatewayFronted` comes from `HOUSTON_MANAGED_CLOUD`, set only by the `engine-pod` image target; the reserved-name refusal relies on it, so a self-host that set it would lose that refusal.

`ownerSub` is the org owner (or the AI Manager pod's person), used to backfill `created_by` on old routines at boot and as the fallback creator.

`loopbackEgress` is set only by the dev launcher (`scripts/dev/control-plane.sh`).

`shutdownDrainMs` is set by the orchestrator beside the termination grace and parsed strictly; the desktop uses a short default since its app is already gone.

`podToken` is the real `HOUSTON_HOST_TOKEN` on managed pods (the gateway can recompute it); the desktop's per-boot token is not one.

Integrations: desktops get `HOUSTON_INTEGRATIONS_URL` (the gateway holding the key); self-host and managed pods go direct with `COMPOSIO_API_KEY`; both set means the gateway wins (so dev's prod simulation is one knob); neither means off. Never ship a shared key to desktops.

Credentials on managed pods live at org level in the gateway (single refresher); the local file is only a one-time adoption fallback.

Turn log ingest lives on the gateway that owns the Redis streams, not the pod store; absent means fall back to the store gateway for old control planes.

Boot order: hydration first in managed mode (readiness-critical; failure restarts the pod rather than syncing an empty tree), only after the predecessor drain window closed and this boot's lease claim landed. The shared mirror pull starts after agent hydration without blocking; the first turn joins it.

Boot migrations run before the watcher so their writes are on disk when reactivity turns on, and each failure is logged loudly with no UI to toast (the supervisor stays up): the flat pre-v0.4 `.houston` layout split into per-type folders (originals kept, idempotent); seeded `*.schema.json` refreshed to this build's schemas (a stale `additionalProperties: false` copy tells the model to strip host-stamped fields; content-compared, so steady state writes nothing); the retired onboarding section removed from `CLAUDE.md`; org-owner `created_by` backfill on managed pods (the planner's snapshot is projected from this doc on the next upload, so the boot stamp is the whole repair); the Rust chat-history import (re-scanned every boot, see `chat-history.ts`). On managed cloud, legacy custom-integration secrets move to custody before the sync loop. Passive hosts mutate nothing.

Passive mode runs no daemons and no doc-shadow seed (the seed writes docs, which would overwrite the live agent's).

View docs are self-warmed at boot.

The catalog is read at boot so a missing one shows in the startup log.

Boot reports are pushed to the gateway because pods scale to zero and cannot be scraped.

Upload sessions on managed pods commit through gateway staging, since sink URLs cannot reach the pod.

Stop: the drain stamp is flushed at once (the replacement is created about a second into the drain), the usage sampler drains its last stretch, runtimes are awaited to exit (bounded, so the final sync never walks `/data` while they flush; they drain within `HOUSTON_RUNTIME_DRAIN_MS`, plus `SHUTDOWN_EXIT_SLACK_MS`), then the standing frame capture stops (stopping earlier drops the last frames), then the stamp is expired so the final sync ships a closed window.

`standDown` stops local routine fires and runtimes, because a respawn would auto-resume turns the other engine runs.

### Managed store config

Lives in `src/local/managed-store-config.ts`. Both managed caches use the same gateway and bearer; agent state uses the agent prefix, shared state the org prefix bound to this pod's agent slug. The lease claim happens before anything hydrates or syncs: every legitimate new writer boots (container restarts and reschedules included), and a resumed zombie does not re-run boot, so it cannot reclaim. A 404 means an unfenced gateway; any other claim failure is fatal, because syncing unfenced against a fencing gateway would 409 the first write. The claim response's `generations` capability lets an empty prefix send create-only preconditions; old gateways omit it and capability is inferred. That capability covers the shared prefix too.

### Migration round trip

Pinned by `src/local/migration-roundtrip.test.ts`. A source host boots passively on a Rust-era tree (flat layout, markdown learnings, chat db, `.sid` tracker), its boot migrations convert in place, and the wizard's calls run against a target. The legacy color rides the scan so the wizard seeds it, and the imported legacy metadata makes the target serve the color on its next list. `integrations.json` never crosses; its toolkit list rides the manifest.

### Local reactivity

Pinned by `src/local/reactivity.test.ts`. A skill created through the API lands at the exact path pi reads (`<W>/<A>/.agents/skills/<slug>/SKILL.md`). A raw write under `.houston` reaches `/v1/events` as the right event through FsWatcher, EventHub and SSE; this is the local analog of cloud's post-turn synthetic sync. Directories that exist before the watcher arms report writes at full paths; a directory created after arming may surface as a coarse parent event, and the watcher may emit a broad `FilesChanged` before the specific event.

### Runtime command

Lives in `src/local/runtime-command.ts`. Explicit env wins, then a packaged sidecar spawns itself, then Docker spawns the sibling runtime bundle, then dev runs source through tsx.

### View sink

Lives in `src/local/view-sink.ts` (`createViewSink`). Publishes provider, usage and custom-definition views to the managed doc store for the sleeping pod. One agent per route (a view captured for another id never lands under the bound agent), and publishes are serialized per family so captures land in order and an older body cannot win the CAS retry. Cloud pods with dual-write only.

## Heartbeat, feedback and telemetry

### Agent role tracker

Pinned by `src/agent-role/role-tracker.test.ts`. An agent's listed role follows its job description whoever wrote it, and the change is announced only once the gateway's listing (served from its own database) already has it. Edits to other context files, or body-only edits, move no role. When nothing landed nothing is announced, at warning level.

Lives in `src/agent-role/role-tracker.ts` (`AgentRoleTracker`). Fed `ContextChanged`, it re-reads the role from the job description whoever wrote it, publishes it where the listing reads it (gateway-fronted pods) before announcing `AgentRoleChanged`, serialized per agent. The first read in a process counts as a change, which lazily backfills pods whose agent predates the role document. `RolePublishDeferredError` (doc route not bound or the gateway deferred) is transient, a warning; the role stays unrecorded so the next change or addressed request (`ensureTracked`, a no-op once known) retries.

### Feedback sender

Lives in `src/feedback-linear.ts`, a port of the desktop's `bug_report/linear.rs`; refusals are typed the way `bug_report/failure.rs` classifies them.

### Feedback intake

Pinned by `src/feedback.test.ts`. Formatting mirrors the desktop's `bug_report/format.rs` so web and desktop reports read the same in the feedback tracker, which is reached through its GraphQL API (label lookup, then issue create). Non-string fields become empty. A plan-cap refusal is typed so the route answers the fallback 503. The route: no token 401, not configured 503, bad payload 400, success files with the verified user id and returns the identifier.

Lives in `src/feedback.ts`. The desktop files reports through a Tauri command (`app/src-tauri/src/bug_report`); a browser cannot hold the feedback service key, so the host fronts the same payload and formatting (ported from `bug_report/format.rs`). Error text is capped at 6,000 characters. `FeedbackIntakeError` `intake_unavailable` means the service refuses every report from our side (plan cap, rate limit, outage), matched on the message and every string in its GraphQL `extensions`, or on 429 and 5xx; a 400 body can still name the quota. The route answers it 503 and the app uses its fallback.

### Heartbeat runner

Pinned by `src/heartbeat/runner.test.ts`. The briefing never reads a workspace other than the person's, even though the operator list holds strangers'. An admitted but unfinished briefing does not notify. The delivered message uses the exact bytes the cloud gateway sends, which channels key on. Morning is judged in the person's timezone. A mission the person has not been told about is news; the first briefing counts any item; an unchanged mission is retold the next morning.

Lives in `src/heartbeat/runner.ts`. One briefing per workspace per local date, deduped across replicas with a lock whose TTL (two days) outlives the local day in any zone. Runs on the assistant's own conversation. Empty snapshots or no news on a scheduled tick record quiet without calling the model; admission records delivered and a later tick settles the finished turn, advances the news baseline and notifies. Attempts run one at a time. Never into a running turn. The snapshot is read before the date is burned, so a failure retries. The nonce rides the persisted user message so settle finds the turn. "Brief me now" ignores time and date.

### Briefing settle

Lives in `src/heartbeat/settle.ts`. The briefing turn is found by its nonce (user message) and `turnId` (replies) in the live transcript, else archive segments newest first (the runtime never splits a turn across files), stopping at a segment that ends before the briefing started. Provider error, stop, engine-restart interruption or no words is a failed briefing. Nothing is read while the manager is busy. Settled elsewhere or replaced by a newer briefing means the outcome is not this document's to apply.

### Boot telemetry retries

Pinned by `src/telemetry/boot.test.ts`. Retry attempts are breadcrumbs without an error object; only the give-up carries one, naming the cause.

Lives in `src/telemetry/boot.ts` and `boot-report.ts`. Named boot phases (`runtime_spawn` only on managed pods) share wire names with the gateway's ingest, so adding one needs whitelisting there. One ledger serves `/metrics` and the one-shot boot report pods push after ready (pods scale to zero, so nothing scrapes a boot). The report gets one retry on network or 5xx; only the give-up is an error, naming the cause from undici's `cause`. Other 4xx are not retried. 404 and 401 (an older gateway's authenticated not-found fallback answers 401 to a pod bearer) mean nothing to report to and skip quietly; a real token mismatch shows on the pod's other routes.

### Usage sampler

Lives in `src/usage/sampler.ts`. The gateway meters a pod's awake time from outside but cannot see execution time, so the pod samples its own busy state (turn busy or routine runs running, without waking anything) every few seconds, accrues per-UTC-day totals split at midnight, and reports cumulative totals per boot and day to the gateway's ingest. Cumulative plus a GREATEST upsert on (bootId, day) makes at-least-once flushing exact. Each report carries the current busy state, which the control plane uses to label the pod for a PodDisruptionBudget against node drains, so busy edges always report (a floor holds rapid edges to the next sample) and a periodic flush runs during long work. The credited stretch is capped so a starved loop never counts dead time; the idle tick ending a turn is not credited (bounded undercount). Days outside the reporting window are dropped. Built only on managed pods. Reporting is accounting, never load-bearing: failures are logged once per distinct message and swallowed; a 404 means an older gateway. `stop` is the SIGTERM drain hook.

### Smaller rules

`src/telemetry/model-call-report.ts`: each turn's model-call report is forwarded once (a retry racing a lost response would double count; replayed settles are skipped by turn id, remembering 512); network and 5xx are warnings; 401 and 404 (older gateway, refused token or slug) warn once per process; any other refusal is a contract bug and the first is an error. Never rejects.

`src/telemetry/push-report.ts`: push is advisory; failures are reported locally and never fail a turn.

`src/heartbeat/collect.ts`: only the person's own workspaces are read (never the operator list), dot-named agents are never listed, failures are isolated per agent, and an agent read with diagnostics is named unread so its seen keys survive.

`src/agent-role/role-publisher.ts`: the role is PUT to the doc store the gateway's `GET /agents` reads in one query, so listing never wakes pods; the one-agent rule applies; unbound or unstored throws so the tracker retries; a gateway that cannot hold role docs is not retried. Boot backfill publishes once the doc route binds.

`src/heartbeat/daemon.ts`: a 60-second tick asks the runner; an attempt in flight is skipped, not queued; failures are logged and never stop the next tick; the timer is unref'd.

`src/agent-role/read-role.ts` (`readAgentRole`): the job description is `CLAUDE.md`; one read backs both the listing's role and the published role document so they never disagree.

`src/heartbeat/manager.ts`: the manager's directory is created before its channel context is used.

## Deployment wiring

### Control plane config

Lives in `src/config.ts`. All secrets come from env. Notable settings: `CP_DEV=1` swaps live adapters for in-memory ones; newly created workspaces default to `cloudrun`; a per-workspace turn budget per hour; `codexModels` must be ids OpenAI serves to a ChatGPT subscription, kept in step with `packages/runtime/src/ai/codex-offered.ts` minus hidden ids, default first; `CP_REDIS_URL` shares turn state so the control plane can run several replicas; `CP_SERVICE_TOKENS` maps static tokens to users for unattended callers through the normal authz path; the feedback key unset makes `/feedback` 503; `CP_ADMIN_USER_IDS` empty turns the admin API off and it never falls open; cost rates are estimates from request totals, with an optional BigQuery billing export as the authoritative number.

### Deployment deps bag

Lives in `src/control-plane-deps.ts` (`ControlPlaneDeps`). Profiles (desktop, self-host, managed pod) differ only in what they set here; an absent dependency is a named refusal on the routes that need it, never a crash: no channel for a workspace runtime is 503; no vfs makes the typed families 503; no event hub makes `/v1/events` 503; no `mountAdmin` makes `/admin/*` 404 (the local profile never sets it); no feedback sender makes `/feedback` 503; no integrations make those routes 503; no custom integrations make definition routes 404 (read as an unsupported host) and sandbox setup routes 503; no agent-config library lists empty and installs 503; no trigger lock makes the trigger-events route 503 (present on every host with a turn bus); no metrics makes `/metrics` 404. `chatHistoryMigrated` drives the one-time reconnect moment. `gatewayFronted` and `ownerSub` follow the routine actor rules described above (the pod's local user id has no upstream membership and would 401 every integration call). The scheduled-instant lock TTL is 24 hours on managed pods and 1 hour elsewhere. `triggersEnabled` is distinct from the edge-advertised `capabilities.triggers`.

### Cloud egress validation

Lives in `src/custom-endpoint-validation.ts` (`checkPublicHttpsEndpoint`). A managed pod's NetworkPolicy allows only public TCP 443, so a base URL targeting RFC 1918, loopback, link-local, IPv6 ULA, the metadata IP, a non-443 port or plain http can never connect and is rejected at save with a typed `code` for translated copy. Desktop and self-host skip this. The private-host check runs first, because `http://localhost:11434` breaks every rule and "the cloud cannot reach your computer" is the one to act on. WHATWG URL normalizes `:443` to an empty port, so any port is an explicit non-443 one. `.local` mDNS names are blocked. Blocked IPv4 also covers 0/8, CGNAT 100.64/10, 198.18/15, multicast and broadcast. IPv6: zone ids are dropped; IPv4-mapped literals (which WHATWG normalizes to hex, like `::ffff:a9fe:a9fe`) are range-checked on the embedded IPv4, and every other `::/96` or unparseable literal fails closed; ULA and link-local are blocked.

### Ports

Lives in `src/ports.ts`.

Every outward dependency is an interface with an in-memory or fake implementation and a live one; core logic never imports a concrete adapter.

`AgentNameConflictError`: names compare with `sameAgentName` (trimmed, NFC, case-insensitive) because a name is a folder and macOS and Windows folders are case-insensitive; stores throw it before touching the existing agent; routes answer 409 `name_taken`. `createAgent` never returns an existing agent, because callers seed the result and roll it back on failure. `renameAgent` allows a re-spelling of the agent's own name.

`InvalidAgentNameError` is the typed backstop for names `validateAgentName` rejects, so a route that skipped pre-validation answers 400.

`ApiKeyRejectedError` carries the runtime's typed verdict (`ApiKeyVerifyReason`), undefined for older runtimes.

`LauncherClosedError` and `AgentRenamingError` both answer 503 with `Retry-After`: a drain refuses spawns that would orphan, and a rename latch makes old-id traffic expected.

`ForwardRequest` relays method, path, query (caller auth stripped) and raw body one to one; only the gateway's acting token and `Last-Event-ID` are relayed as headers; query cursors ride `search`.

`RuntimeLauncher`: per-turn runtimes have none. `hold` is optional for launchers keyed by stable ids (pods). `isClosed` is optional.

`ChannelCtx.body`: a channel must prefer a body already drained by the route.

`TurnPin` overrides are per turn and never touch saved settings, so a pinned routine and nearby chats cannot clobber each other.

`RuntimeChannel`: one interface, one adapter per hosting model, chosen by `workspace.runtime`. `fireTurn` resolves on acceptance and throws when it cannot start. `cancelTurn` is called after the run is marked cancelled. `busy` must treat unknown transport state as busy. `withQuiesced` (stop plus latch) exists for operations that move on-disk identity; per-turn channels omit it. `captureCredential` takes the just-connected provider so the right credential is exported.

`WorkspaceCredential`: `oauth` credentials have access and refresh tokens rotated centrally; `api_key` credentials have `refreshToken` "" and `expiresAt` 0, the sentinel that means never refresh. Absent `kind` reads as oauth (legacy). `enterpriseUrl` is a non-secret base URL (Copilot Enterprise domain, Azure per-resource endpoint).

`CredentialStore.invalidate` exists only on caching stores. `put` with `ifAbsent` is a fill, required for cached snapshot pushes. `removeIfAccess` is the only safe way to act on a revocation report.

`CredentialVault` mints and validates the non-secret sandbox identity tokens.

### Smaller rules

`src/control-plane-assistant-deps.ts`: the heartbeat runner is wired only on local and self-host; absent, run-now answers 501.

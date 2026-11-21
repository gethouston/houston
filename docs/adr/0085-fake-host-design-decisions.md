# Fake host: design decisions

Covers `packages/fake-host/`: the in-memory protocol v3 host the UI and e2e suites run against. Short file paths are relative to `packages/fake-host/`.

## An in-memory protocol v3 host that mirrors, never re-implements

`@houston/fake-host` is the in-memory host the UI and e2e suites run against. It models the gateway-augmented view the client sees (gateway routes plus host routes) and shares the real code wherever it can: the chat stream uses the same shared publish path and `formatSseFrame` as the runtime (sequence authority, replay buffer, snapshot), activity updates go through `applyActivityUpdate` from `@houston/domain`, file MIME types come from the real host's `mimeFor`, @mention sidecars go through the same wire guard as the real send routes, sidebar layouts are validated with the real host's guard, and config writes keep host-owned first-day fields via `keepHostOwnedConfig`. Wire shapes are mirrored structurally from protocol and engine-adapter types so the mock cannot drift silently.

Lives in `packages/fake-host/src/index.ts`, `chat.ts`, `chat-channel.ts`, `state-activities.ts`, `routes-files.ts`, `routes-agent-runtime.ts`, `state-agents.ts`.

## Pure router

The router is a pure `Request -> Response` function with no Node HTTP coupling, so it runs inside the Node adapter, a Playwright route or a unit test alike. The Node adapter force-closes SSE streams on shutdown so `close()` cannot hang. Binary uploads keep their body stream because `req.json()` would consume it.

Lives in `src/router.ts`, `src/server.ts`, `src/http.ts`.

## CORS covers every adapter header

The permissive CORS answer must list every header `gatewayAuthFetch` attaches, or every request fails preflight. The chat stream carries `Authorization`, so the browser preflights it too.

Lives in `src/http.ts`, `src/sse.ts`.

## Plain Node loading

Modules that import domain code use package subpaths, because the domain barrel reaches JSON schema imports and extensionless relative imports that Node's own loader refuses when the fake host runs standalone.

Lives in `src/routes-first-day.ts`, `src/routes-portable.ts`.

## Ports per worktree

The fake host port carries a stable per-worktree offset derived from the workspace root, so parallel worktrees running e2e never collide. The offset stride is at least the per-worker fake-host slots (workers plus one) plus the auth Vite server. Without a workspace marker one stable bucket is used. `HOUSTON_E2E_FAKE_HOST_PORT` overrides the base.

Lives in `src/config.ts`.

## Seed fixtures

The seeded agent is selected as `last_agent_id` so the shell opens on it. The seeded AI Employee is never named "Houston", the AI Manager's display name, because name-based lookups would confuse them. The AI Manager has its own hidden agent that `GET /v1/assistant` answers with. The bearer token is accepted unconditionally. Seed files, a seeded connection and memory entries in two shapes (with and without provenance) give each tab rows on first paint. A real one-page PDF backs the office preview so the PDF renderer is exercised. A fixed markdown document pins the chat type scale for the visual suite.

Lives in `src/config.ts`, `src/state-store.ts`, `src/office-preview.ts`, `src/markdown-showcase.ts`.

## Test controls under `/__test__/*`

Specs arm state through `/__test__/*` routes (capabilities, integrations mode, org roster, plan, billing choice, compute usage, chat scripts, tool calls, holds, emits). Arming replaces the whole world for that surface and clears its call ledger so assertions see only what happened since. Unarmed surfaces answer like a deployment without the feature (404 or the single-player default). One-shot arms disarm as they are taken, and `reset()` restores the seed before each test. A turn hold has a safety cap so a spec that never releases cannot hang.

Lives in `src/state-*.ts`, `src/routes-*.ts`, `src/chat-hold.ts`, `src/chat-script.ts`, `src/chat-tools.ts`, `src/chat-controls.ts`.

## Turn and history semantics match the runtime

The user message persists at turn start stamped with the turn id; the reply persists at turn end with the same id; `displayText` follows the runtime contract. Stop writes the durable "stopped by user" marker and retires the bound activity's pending interaction. Edit-and-resend cuts the transcript at the named user turn. Dead turns get the host reaper's copy and id. Scripted replies stream as three deltas so the UI exercises accumulation. Fire-and-forget turns crash the harness loudly on failure, because a swallowed fake-host bug would read as an app bug. A cold-start hold makes per-agent reads stall the way they do behind the gateway while a pod wakes.

Lives in `src/chat-turn.ts`, `src/state-history.ts`, `src/chat-script.ts`, `src/router.ts`.

## Routine id counter is global

Minted routine ids use one global counter, unlike the real host where ids are per agent, and a control can rewind it so the next routine on any agent reuses an id another agent holds. That reproduces cross-agent id collisions deterministically.

Lives in `src/state-store.ts`.

## Gateway rules the fake enforces

The org roster and invites are served only to owner and admin; a plain member gets the minimal view. Grants are admin or user, never owner.

Invite accept answers `403 needs_upgrade` (invite kept) when the team's trial ended, `409 already_member` (kept), and `404 invite_not_found` for revoked, used or misaddressed invites without saying which. Billing never gates a decline.

A locked org refuses every billing write, owner included. A removed yearly seat stays paid until renewal. The AI Manager never pays for a seat. An add whose quote is missing or differs is told the price changed.

Display names are one line of at most 60 characters, stored trimmed. Photos are https URLs or inline png, jpeg or webp data URLs, size capped; an http URL would break the page lock.

Composer attachments follow the real host's 100 MB request cap (413), estimating base64 at about 4/3 of the byte size.

Uploads never overwrite: the name gets a " (n)" suffix. Rename and move refuse an occupied name with the real host's status and code. An unwritable volume refuses every write primitive.

Real client-generated activity ids are honoured so optimistic flows work. Server-stamped fields (attribution, mentions, agent-started marker, last message time, starting AI) are accepted only so specs can seed them.

Team name length mirrors the gateway's `maxTeamNameLen`.

Checkout URLs are never real Stripe hosts; specs stub `window.open`.

Lives in `src/routes-teams.ts`, `src/routes-spaces.ts`, `src/state-org-lock.ts`, `src/routes-seats.ts`, `src/routes-me.ts`, `src/routes-agent-data.ts`, `src/state-workspace*.ts`, `src/routes-files.ts`, `src/state-activities.ts`, `src/routes-org-create.ts`, `src/state-plan.ts`.

## Reactivity on direct file writes

Writes to the board file emit `ActivityChanged`, a job description whose role changed emits once the listing already serves the new role, and a direct `SKILL.md` write emits `SkillsChanged`, matching the real file watcher.

Lives in `src/state-agents.ts`, `src/state-skills.ts`.

## Provider catalog lookup by raw string

The fake provider catalog is keyed by raw string so an unparsed body can be looked up without casting to `ProviderId`.

Lives in `src/provider-catalog.ts`.

## Buffers for BodyInit

Zip bytes are copied into a fresh ArrayBuffer-backed view because `BodyInit` rejects a view over a possibly shared buffer.

Lives in `src/routes-portable.ts`.

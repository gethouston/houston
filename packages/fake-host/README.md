# @houston/fake-host

An in-memory, **protocol-v3** Houston host for UI / e2e tests. A single Node
process answers just enough of the host + per-agent runtime for the desktop UI
(`app/src`) to boot and run on the new-engine adapter in **host mode** — with NO
real backend, no AI provider, no credentials. Deterministic and hermetic: the
same click always produces the same pixels.

It is **private** and dev-only (never published, never shipped in a build).

## Why it can't drift from the wire

The chat stream is built from the SAME server pieces as the real runtime/host:
`StreamChannel` (per-conversation seq authority + replay buffer + snapshot),
`serveResumableStream` (fresh connect → `sync`; `?after=<seq>` / `Last-Event-ID`
→ gap/dupe-free replay; unserviceable cursor → `sync` with `resync: true`), and
`formatSseFrame` — all from `@houston/runtime-client`. Wire shapes (`Activity`,
`Capabilities`, `ChatMessage`, `TokenUsage`, `WireFrame`) come from
`@houston/protocol`, so a contract change breaks this package's typecheck instead
of silently drifting the mock.

## API

```ts
import { startFakeHost, FAKE_HOST_PORT } from "@houston/fake-host";

const host = await startFakeHost(); // defaults to FAKE_HOST_PORT (4399)
// host.port  -> the bound port (pass 0 to startFakeHost for an ephemeral one)
// host.url   -> `http://localhost:<port>`
await host.stop(); // closes the listener + its open SSE connections
```

Exported constants describe the host and its seed: `FAKE_HOST_PORT`,
`FAKE_HOST_URL`, `FAKE_TOKEN`, `SEED_AGENT_ID`, `SEED_AGENT_NAME`,
`SEED_WORKSPACE_ID`.

Run it standalone (what Playwright's `webServer` does):

```bash
pnpm --filter @houston/fake-host start   # tsx src/main.ts, listens on :4399
```

Set `FAKE_HOST_LOG=1` to log every request it serves.

## `POST /__test__/*` control endpoints

Server-to-server test controls (no CORS gate; the harness calls them directly).
They drive the failure/reactivity scenarios the specs assert against:

| Route | Body | Effect |
| --- | --- | --- |
| `/__test__/reset` | — | Restore the seed + clear all chat channels (called before each test). |
| `/__test__/emit` | `{ type, agentPath? }` | Push a domain event onto the `/v1/events` reactivity feed. |
| `/__test__/chat-config` | `{ replyDelayMs }` | Slow the canned reply so a drop/kill lands mid-turn deterministically. |
| `/__test__/chat-interaction` | `{ interaction }` | Arm the NEXT scripted turn to end on a `PendingInteraction` (its `done` frame carries it) so the settle lands the card on `needs_you` + composer card. `null` disarms. |
| `/__test__/drop-chat-streams` | — | Sever every open chat stream WITHOUT ending the turns (network blip). Returns `{ dropped }`. |
| `/__test__/kill-turn` | — | Synthesize the host reaper's terminal `error` frame on every running turn (dead-turn settle). Returns `{ killed }`. |
| `/__test__/turn-boundary` | `{ nextText }` | End the running turn while nobody watches, then start the next one, so a reconnect resyncs onto a DIFFERENT turnId. Returns `{ advanced }`. |
| `/__test__/integrations-mode` | `{ mode }` | Composio readiness: `ready` \| `unavailable` (503) \| `signin`. Returns `{ mode }`. |
| `/__test__/integrations-activate` | `{ connectionId }` | Flip a pending connection to `active` (models the OAuth completing). Returns `{ activated }`. |
| `/__test__/capabilities` | `Partial<Capabilities>` | Merge a partial into the advertised `/v1/capabilities`. Arm the Teams-shaped state single-player can't reach — e.g. `{ integrations:["composio"], multiplayer:true, teams:true, role:"owner" }` to light up the agent Integrations tab's locked browse rows, or just `{ integrations:["composio"] }` for a single-player-with-apps run. Returns the merged capabilities. |
| `/__test__/agent-settings` | `{ allowedToolkits?, orgAllowedToolkits?, allowedModels?, access? }` | Set the Teams v2 ceilings served at `/v1/agents/:slug/settings` + `/v1/org/settings` (`allowedToolkits`/`orgAllowedToolkits`: `null` = unrestricted, `[]` = none). The `effectiveAllowlist` = agent ∩ org drives the tab's connectable-vs-locked partition. Returns the merged settings. |
| `/__test__/workspaces` | `{ teams: [{ slug, name }] }` | Arm the team-space rows the C8 Spaces workspaces bridge serves at `GET /v1/workspaces` (alongside the always-present personal seed row). Each `slug` (exactly `[a-f0-9]{16}`) becomes an `{ id:"org:<slug>", kind:"org" }` switcher row. Pair with `/__test__/capabilities` `{ spaces:true }`. `{ teams: [] }` (and reset) restores personal-only. Returns the armed `{ teams }`. |

## Modeled surface

- `/health`, `/version` — top-level probes. The real host serves no flat
  `/auth/status` or `/providers`, so neither exists here.
- `/setup-runtime/*` — the host's pre-agent connect surface: `providers`,
  `auth/status`, the `auth/:provider/login[/complete|/cancel]` chain, and the
  `credential/*` pushes. Its slot seeds EMPTY (first-run truth): the WebApp
  boot gate is reachability-only, and onboarding's connect step shows a
  Connect pill per provider. Connect mutations flip the slot for both reads.
- `/v1/capabilities` (single-player `local` profile by default; armable to a
  Teams-shaped set), `/v1/workspaces` (the personal seed row plus any team-space
  rows armed by `/__test__/workspaces` — the C8 Spaces bridge), `/v1/integrations`,
  `/v1/preferences`, `/v1/events` (reactivity feed).
- `/v1/org` (Teams v2 identity + roster + pending `invites`) and
  `POST /v1/org/members` (invite path: an unknown email mints a pending invite,
  `202 { invited:true }`, then surfaced in `/v1/org`'s `invites`;
  `DELETE /v1/org/invites/:id` revokes).
- `/v1/agents/:slug/settings` + `/v1/org/settings` (Teams v2, the gateway-only
  allowlist/model ceilings `getAgentSettings` / `getOrgSettings` read; GET + the
  manager/owner PUT). Seeded unrestricted; armed by `/__test__/agent-settings`.
- `/agents/*` — the per-agent control plane + runtime proxy: agents CRUD,
  activities (backed by the SAME `.houston/activity/activity.json` the board
  reads via `/agents/:id/agentfile/*`), routines/skills (empty), providers/auth/
  settings/title, and the conversation stream
  (`/agents/:id/conversations/:cid/{events,messages,cancel}`).

Need more host behavior for a spec? Extend `src/state.ts` + `src/routes.ts`.

## Consumers

`packages/web`'s Playwright suite (`packages/web/e2e`) is the primary consumer
and the proof of behavior: `pnpm --filter houston-web test:e2e`.

# @houston/fake-host

An in-memory, **protocol-v3** Houston host for UI / e2e tests. A small Node
server (one per Playwright worker in the e2e suite — see `src/config.ts`)
answers just enough of the host + per-agent runtime for the desktop UI
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

Both seeded missions carry Teams attribution (`created_by` + `contributors`,
`state-store.ts`): "Plan a trip to Tokyo" has 2 people, "Draft the launch email"
has 7 — enough to overflow the mission card's five-face cap and render its "+N"
chip. The app only paints face stacks in multiplayer, so a default single-player
run (and every visual baseline) is unaffected; arm
`/__test__/capabilities` `{ multiplayer: true }` to make them appear, and read
them on Mission Control (the per-agent board's default `me` person scope hides
missions the signed-in user is not on, and identity is off in the e2e project).

## `POST /__test__/*` control endpoints

Server-to-server test controls (no CORS gate; the harness calls them directly).
They drive the failure/reactivity scenarios the specs assert against:

| Route | Body | Effect |
| --- | --- | --- |
| `/__test__/reset` | — | Restore the seed + clear all chat channels (called before each test). |
| `/__test__/emit` | `{ type, agentPath? }` | Push a domain event onto the `/v1/events` reactivity feed. |
| `/__test__/chat-config` | `{ replyDelayMs }` | Slow the canned reply so a drop/kill lands mid-turn deterministically. |
| `/__test__/chat-interaction` | `{ interaction }` | Arm the NEXT scripted turn to end on a `PendingInteraction` (its `done` frame carries it) so the settle lands the card on `needs_you` + composer card. `null` disarms. |
| `/__test__/chat-history` | `{ conversationId, messages, agentId? }` | Replace a conversation's transcript verbatim with the given `ChatMessage[]` (defaults to the seeded agent). The only way to reach a SHARED conversation locally: user messages carrying the `author` the cloud gateway stamps in multiplayer, which the sender-attribution spec renders. Returns `{ messages }`. |
| `/__test__/drop-chat-streams` | — | Sever every open chat stream WITHOUT ending the turns (network blip). Returns `{ dropped }`. |
| `/__test__/kill-turn` | — | Synthesize the host reaper's terminal `error` frame on every running turn (dead-turn settle). Returns `{ killed }`. |
| `/__test__/turn-boundary` | `{ nextText }` | End the running turn while nobody watches, then start the next one, so a reconnect resyncs onto a DIFFERENT turnId. Returns `{ advanced }`. |
| `/__test__/hold-agent-reads` | `{ ms }` | Stall every per-agent read (`GET /agents/:id/*`) by `ms` — the cloud gateway's `ensureAwake` hold, where an asleep pod's reads hang until it wakes. `{ ms: 0 }` (and reset) answers instantly again. Returns `{ ms }`. |
| `/__test__/fail-agent-reads` | `{ agentIds, segments? }` | Answer `500` to per-agent reads for the named agents while the rest of the fleet stays healthy — the half-broken fleet a cross-agent sweep must survive. `segments` (e.g. `["routine_runs"]`) narrows it to those sub-resources, the subtler state where one route is down while the same agent answers the rest; omit it to fail every read. `{ agentIds: [] }` (and reset) restores them. Returns `{ agentIds, segments }`. |
| `/__test__/routine-seq` | `{ next }` | Rewind the routine-id counter, so the NEXT routine created on ANY agent takes an id an earlier agent already holds. Routine ids are unique per AGENT in the real host, so that collision is ordinary truth; this fake's single global counter is the only reason a spec would never see it. Returns `{ next }`. |
| `/__test__/integrations-mode` | `{ mode }` | Composio readiness: `ready` \| `unavailable` (503) \| `signin`. Returns `{ mode }`. |
| `/__test__/integrations-activate` | `{ connectionId }` | Flip a pending connection to `active` (models the OAuth completing). Returns `{ activated }`. |
| `/__test__/integrations-connection` | `{ toolkit, status }` | Seed a connection at rest in a status clicking can't reach: `pending` (abandoned sign-in) or `error` (the provider refused); re-statuses the toolkit's existing connection when it has one. Those apps stay in the browse catalog wearing that status. Returns `{ connection }`. |
| `/__test__/capabilities` | `Partial<Capabilities>` | Merge a partial into the advertised `/v1/capabilities`. Arm the Teams-shaped state single-player can't reach — e.g. `{ integrations:["composio"], multiplayer:true, teams:true, role:"owner" }` to light up the agent Integrations tab's locked browse rows, or just `{ integrations:["composio"] }` for a single-player-with-apps run. Returns the merged capabilities. |
| `/__test__/agent-settings` | `{ allowedToolkits?, orgAllowedToolkits?, allowedModels?, access? }` | Set the Teams v2 ceilings served at `/v1/agents/:slug/settings` + `/v1/org/settings` (`allowedToolkits`/`orgAllowedToolkits`: `null` = unrestricted, `[]` = none). The `effectiveAllowlist` = agent ∩ org drives the tab's connectable-vs-locked partition. Returns the merged settings. |
| `/__test__/org` | `{ members?: [{ userId, email?, role, displayName?, photoUrl? }], agents?: [...] }` | Arm the org roster `GET /v1/org` serves (owner/admin only) and the co-member directory `GET /v1/org/people` serves to EVERY member. `displayName`/`photoUrl` are the stored GCIP profile: a member without a `displayName` is still served, and the client decides who is @mentionable. Arming also SEEDS the identity-provider fallback behind `/v1/me/profile` from the `u-self` row, so clearing a custom name/photo has something honest to fall back to. Pair with `/__test__/capabilities` `{ multiplayer:true, teams:true, role:"owner" }`. Returns `{ members, agents }`. |
| `/__test__/workspaces` | `{ teams: [{ slug, name }] }` | Arm the team-space rows the C8 Spaces workspaces bridge serves at `GET /v1/workspaces` (alongside the always-present personal seed row). Each `slug` (exactly `[a-f0-9]{16}`) becomes an `{ id:"org:<slug>", kind:"org" }` switcher row. Pair with `/__test__/capabilities` `{ spaces:true }`. `{ teams: [] }` (and reset) restores personal-only. Returns the armed `{ teams }`. |
| `/__test__/space-invites` | `{ invites: [{ orgName, role?, invitedBy?, orgSlug?, id?, reject? }] }` | Arm the INVITEE-side invite inbox `GET /v1/orgs` surfaces in `invites` (C8 Spaces) — the sidebar cards under the workspace switcher. Only `orgName` is required (`role` defaults to `user`, the id and the 16-hex `orgSlug` the accepted team lands under are minted). `invitedBy` is the raw gateway field: the card names the inviter only when it is human-readable (an email, or a name with whitespace). `reject` forces THAT invite's answer — `needs_upgrade` (403, invite kept), `already_member` (409, invite kept), `invite_not_found` (404, invite dropped: the revoked-behind-your-back case). The card is capability-gated on the CLIENT, so pair with `/__test__/capabilities` `{ spaces:true }`. `{ invites: [] }` (and reset) empties the inbox. Returns the normalized `{ invites }`. |
| `/__test__/provider-usage` | `{ rows: ProviderUsage[] \| null }` | Arm the live per-account usage `GET /providers/usage` serves — what the AI Models hub's Connected rows meter with (windows, plan, credits, metered tokens, and the honest `unsupported`/`unauthenticated`/`error` rows). `null` (and reset) restores the default seed: the connected Claude subscription on plan `max`, its session window 42% used and its weekly 12%. Returns the served `{ rows }`. |
| `/__test__/compute-usage` | `{ seed: { rows, awakeNow } \| null }` | Arm the per-agent running-time dataset `GET /v1/org/compute-usage` serves (Settings > Time worked). `null` (the default) 404s the route, mirroring desktop/self-host. Pair with `/__test__/capabilities` `{ computeUsage:true }`. Returns `{ seed }`. |

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
- `/v1/org/people` — the sanitized co-member directory of the active space
  (`{people:[{userId,displayName?,photoUrl?}]}`, named first, no emails or
  roles) that the @mention autocomplete reads. Served to every member, unlike
  `GET /v1/org`'s roster; empty until a spec arms `/__test__/org`.
- `/v1/me/profile` — the caller's OWN editable display profile (name + photo):
  `GET` serves the EFFECTIVE `{displayName?, photoUrl?}` plus `custom` flags
  saying which of the two the user set themselves rather than inherited from
  their identity provider; `PUT` takes a string to override a field, `null` to
  clear it back to the provider value, and an omitted key to leave it alone
  (400 with a reason on a bad name or a photo that is neither an https URL nor a
  png/jpeg/webp data URL). A `PUT` also reflects into the `/v1/org/people` +
  `/v1/org/profiles` roster fixtures, so a save visibly repaints the faces. The
  provider fallback is captured from the `u-self` row armed via `/__test__/org`.
- `/v1/org` (Teams v2 identity + roster + pending `invites`) and
  `POST /v1/org/members` (invite path: an unknown email mints a pending invite,
  `202 { invited:true }`, then surfaced in `/v1/org`'s `invites`;
  `DELETE /v1/org/invites/:id` revokes).
- `/v1/orgs` + `/v1/org-invites/*` — the C8 Spaces CROSS-org surface, which
  ignores the `x-houston-org` active-space pin: `GET /v1/orgs` →
  `{orgs, invites}` (every team the caller belongs to, plus every pending invite
  addressed to them), `POST /v1/orgs {name}` → `201 OrgSummary` (mints a team,
  caller = owner), `POST /v1/org-invites/:id/accept` → `201 {org}` and
  `DELETE /v1/org-invites/:id` → `204` (the INVITEE's own accept/decline — not
  the owner's revoke at `/v1/org/invites/:id`). Memberships have one source of
  truth: the same team-space rows `/v1/workspaces` bridges, so accepting an
  invite puts the team in the switcher and in `orgs` at once. The rejection
  bodies are flat `{error, code}`, exactly as the Go gateway writes them —
  that `code` is what the client's invite taxonomy reads. Arm the inbox with
  `/__test__/space-invites`.
- `/v1/agents/:slug/settings` + `/v1/org/settings` (Teams v2, the gateway-only
  allowlist/model ceilings `getAgentSettings` / `getOrgSettings` read; GET + the
  manager/owner PUT). Seeded unrestricted; armed by `/__test__/agent-settings`.
- `/agents/*` — the per-agent control plane + runtime proxy: agents CRUD,
  activities (backed by the SAME `.houston/activity/activity.json` the board
  reads via `/agents/:id/agentfile/*`), routines/skills (empty), providers/auth/
  settings/title, and the conversation stream
  (`/agents/:id/conversations/:cid/{events,messages,cancel}`). The message POST
  carries the same sidecars the real send route takes: `displayText`, and the
  `mentions` @mention list (guarded by the protocol's own `parseMentions`),
  which persists on the stored user message and rides the live `user` frame.

Need more host behavior for a spec? Extend `src/state.ts` + `src/routes.ts`.

## Consumers

`packages/web`'s Playwright suite (`packages/web/e2e`) is the primary consumer
and the proof of behavior: `pnpm --filter houston-web test:e2e`.

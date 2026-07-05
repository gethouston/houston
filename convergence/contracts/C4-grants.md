# C4 — Per-(user, agent) toolkit grants

## Semantics

- A **connection** is per-user (Composio `user_id = sub`): "John's Gmail".
  Connect once, anywhere.
- A **grant** is per-(user, agent): "agent-1 may use John's Gmail". Stored in
  `gateway.toolkit_grants` (C3). No grant row → empty set → the agent can use
  NOTHING of that user's.
- Enforcement at the gateway only (pods/agents are untrusted for policy): see
  C1 — `search` filtered to granted toolkits, `execute` 403 on ungranted.
- Effective tools therefore depend on WHO IS DRIVING: Sarah's grants apply on
  Sarah's turns, John's on John's. Routine turns use the creator's grants.
- Granting requires an assignment (C3). Revoking an assignment leaves grant
  rows in place but they become unreachable (assignment is checked first);
  cleanup is cosmetic, not security.

## UI semantics (per-agent Integrations tab, acting user = viewer)

Three states per toolkit, computed from (connections, grants):

1. **Granted** — connected AND in the grant set → shown under "This agent can
   use", toggle ON; toggling OFF = grant removal (instant PUT).
2. **Available** — connected but not granted → "Your connected apps" with an
   "Allow for this agent" toggle (instant PUT; no OAuth).
3. **Not connected** — browse catalog; "Connect" runs the OAuth/key flow
   (C1 connect + poll) and on success AUTO-GRANTS to the current agent (the
   user connected it from this agent's tab — that's the intent).

Disconnect (per-user, global) stays in the tab with copy making clear it
removes the app for ALL agents ("Disconnect everywhere").

## Wire

- `GET  /v1/agents/:slug/integration-grants` → `{toolkits: string[]}`
- `PUT  /v1/agents/:slug/integration-grants {toolkits: string[]}` → `{ok:true}`
  (replace-set; server validates slugs are plain `[a-z0-9_-]+`, dedupes)
- 403 `{code:"not_assigned"}` when the caller isn't assigned to the agent.

## Local (single-player) grants

The desktop / self-host TS host (`packages/host`) serves the SAME grant model so
single-player has parity with the multiplayer gateway. Differences from the
gateway:

- **Routes** are `/v1/agents/:agentId/integration-grants` (GET/PUT), returning
  `{toolkits: string[]}` on both. No org/assignment concept (personal tier =
  owner-only), so no `not_assigned`; an unknown agent is 404, ownership 403.
- **Materialize-on-first-read default = all connected.** Preserves today's
  behavior (every agent may use every connected app). GET on an agent with no
  stored record materializes the record as ALL toolkits the user currently has
  connected (`provider.listConnections`, statuses `active`+`error`, `pending`
  excluded), persists it, and returns it. Provider not ready (signed out /
  unconfigured) → `{toolkits:[]}` WITHOUT persisting, so a later signed-in read
  materializes the real set. Concurrent first-reads share one in-flight
  materialization (persisted exactly once).
- **Enforcement begins only once a record exists.** The sandbox proxy
  (`/sandbox/integrations/*`) resolves the agent from the HMAC sandbox token
  (which binds `{workspaceId, agentId}`). With a stored record: search is
  filtered to granted toolkits (by the real `ToolMatch.toolkit`), and execute of
  an ungranted toolkit is `403 {error:"toolkit_not_granted"}` — the action's
  toolkit is its slug prefix before the first `_`, lowercased (the Composio
  convention, mirroring C1). No stored record → no filtering (pass-through).
- **Storage** is per agent, inside the agent's own dir
  (`<Workspace>/<Agent>/.houston/integration-grants.json`), so it survives
  restarts and is removed for free when the agent is deleted.
- **Gateway-fronted pods never serve these routes.** A managed cloud pod
  (`HOUSTON_MANAGED_CLOUD` / `gatewayFronted`) leaves the grant dep unwired: the
  gateway in front owns grant policy, so the pod must not shadow it. The routes
  then 404 and the sandbox proxy enforces nothing (the gateway already did).
  Clients read that 404 as "grants unsupported" and degrade without a toast.

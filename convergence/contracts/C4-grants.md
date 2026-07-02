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

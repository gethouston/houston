# Tracker Integration

Houston's project-tracker integration story. **V1 = Linear only.** Designed provider-agnostic in shape, Linear-native in implementation. Don't extract a `TicketProvider` trait until rule-of-three triggers.

Full spec → [`docs/specs/2026-05-23-tracker-integration.html`](../docs/specs/2026-05-23-tracker-integration.html).

## TL;DR for agents working in this code

| Question | Answer |
|----------|--------|
| Where does Linear-specific code live? | `engine/houston-linear/` crate only. Engine-core knows about Linear directly today; refactors to trait after impl #2. |
| Is there a `TicketProvider` trait? | No. Will be `engine/houston-tracker-port` if/when ≥2 concrete crates ship + #3 on roadmap. |
| What client lib does Linear use? | `cynic` — codegen against `engine/houston-linear/schema/linear.graphql`. |
| Where does Linear data live on disk? | `~/.houston/workspaces/<W>/<A>/.houston/trackers/linear/` (raw/ + projection). |
| Where do trackers REST routes live? | `/v1/trackers/:provider/*` — single route family, provider as path param. |
| What does Composio do? | Existing Linear MCP toolkit remains as escape hatch when OAuth not connected. Not the backbone. |
| Adding Jira / GitHub later? | New concrete crate (`engine/houston-jira` etc.). Same disk layout, same route shape, same event shape. No URL or event migration. |
| Should I create a `tracker_*.json` file for a new feature? | Only if the feature applies cross-provider. Linear-specific things stay in `engine/houston-linear` source. |

## Filesystem layout

Matches Houston's existing `.houston/sessions/{anthropic,openai}/` convention (provider-scoped subdirs). See `knowledge-base/files-first.md`.

```
~/.houston/workspaces/<Workspace>/<Agent>/.houston/trackers/
  linear/
    connection.json          { provider: "linear", org_id, oauth_*, capabilities: [...] }
    raw/                     provider-fidelity, as-received
      issues/<linear_uuid>.json
      initiatives/<linear_uuid>.json
      projects/<linear_uuid>.json
      cycles/<linear_uuid>.json
      workflow_states/<linear_uuid>.json
      webhook_events.jsonl   append-only event ledger (webhookId idempotency)
    issues.json              projection (Houston's working shape)
    projects.json
    initiatives.json
    cycles.json
    agent_sessions/<id>.json per-session thread state
    sync_state.json          { cursor, last_reconcile_at, last_error, in_flight }
```

**raw + projection is the anti-corruption layer realized on disk.** Linear webhooks are at-least-once unordered; re-projecting from raw is idempotent. Don't bypass — always write raw first, then project.

**No canonical/ dir today.** That appears only when ≥2 providers ship + cross-provider query proves a real need (rule-of-three for the canonical layer specifically).

## REST surface

All routes mounted at `/v1/trackers/:provider/*`. In V1 only `provider=linear` is accepted; engine returns `400 BAD_REQUEST` for unknown providers.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/trackers/:provider/connect` | Start OAuth (returns authorize URL) |
| POST | `/v1/trackers/:provider/connect/complete` | Finish OAuth (code → token) |
| DELETE | `/v1/trackers/:provider/connect` | Disconnect, revoke, wipe mirror |
| GET | `/v1/trackers/:provider/status` | Connection state, capabilities, sync cursor |
| POST | `/v1/trackers/:provider/sync` | Force reconcile |
| GET | `/v1/trackers/:provider/issues` | List with filter |
| GET | `/v1/trackers/:provider/issues/:id` | Read one (projection) |
| POST | `/v1/trackers/:provider/issues/:id:start-session` | Dispatch via routing |
| POST | `/v1/trackers/:provider/issues/:id:state` | Writeback state |
| POST | `/v1/trackers/:provider/issues/:id:comment` | Add comment |
| GET | `/v1/trackers/:provider/agent-sessions/:id` | Read AgentSession (capability-gated) |
| POST | `/v1/trackers/:provider/agent-sessions/:id:respond` | Send event back (capability-gated) |
| POST | `/v1/trackers/:provider/webhook` | Receive forwarded webhook from `houston-relay` |
| GET/PUT | `/v1/trackers/:provider/routing` | Read/write routing policy |

Mirrors the existing `/v1/providers/:name/login` pattern (anthropic, openai, gemini) — see `knowledge-base/engine-protocol.md`.

## Events + WebSocket topics

New `HoustonEvent` variants — all provider-tagged. Never `LinearIssuesChanged`; always `TrackerIssuesChanged { provider: TrackerProvider, ... }`.

```rust
HoustonEvent::TrackerConnectionChanged   { provider, workspace_id, state }
HoustonEvent::TrackerSyncStatus          { provider, workspace_id, cursor, last_reconcile_at, error }
HoustonEvent::TrackerIssuesChanged       { provider, workspace_id, changed_ids }
HoustonEvent::TrackerProjectsChanged     { provider, workspace_id, changed_ids }
HoustonEvent::TrackerInitiativesChanged  { provider, workspace_id, changed_ids }
HoustonEvent::TrackerCyclesChanged       { provider, workspace_id, changed_ids }
HoustonEvent::AgentSessionEvent          { provider, workspace_id, session_id, kind, payload }
```

WS topic: `tracker:<provider>:<workspace_id>` (e.g. `tracker:linear:wsid_abc`). The firehose subscription `*` continues to deliver everything. Remote clients subscribe narrowly.

`TrackerProvider` is a typed enum in `engine/houston-engine-protocol`:

```rust
#[derive(Copy, Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackerProvider {
    Linear,
    // Jira,    <-- added when crate lands
    // Github,
    // Asana,
}
```

## Capability model

`capabilities` array in `connection.json` declares what the connected provider supports. UI features gate on this — no trait downcast needed at runtime.

```json
{
  "provider": "linear",
  "org_id": "...",
  "oauth_*": "...",
  "capabilities": [
    "issues",
    "projects",
    "initiatives",
    "cycles",
    "milestones",
    "subtasks",
    "webhooks",
    "agent_session"
  ]
}
```

UI gating example:

```tsx
const { capabilities } = useTrackerConnection(workspaceId);
{capabilities.includes("agent_session") && <AgentSessionPanel ... />}
{capabilities.includes("cycles") && <CycleSelector ... />}
{capabilities.includes("sprints") && <SprintSelector ... />}  // future Jira-only
```

When the trait extraction happens (post-rule-of-three), capabilities migrate from JSON-listed strings to typed marker traits (`AgentSessionAware`, `Sprintable`, `Cyclable`). UI code doesn't change — the capability check is still a hashset lookup. The refactor is purely engine-side.

## Linear specifics

### GraphQL client

`cynic` codegen against vendored schema:

```
engine/houston-linear/
  schema/linear.graphql         vendored from `npx get-graphql-schema https://api.linear.app/graphql`
  build.rs                      runs cynic-codegen to produce typed query modules
  src/queries/
    issues.rs                   IssueListQuery, IssueGetQuery, ...
    projects.rs
    agent_session.rs
  src/mutations/
    issue_update.rs
    comment_create.rs
    agent_session_event.rs
```

Schema refresh: `bash scripts/refresh-linear-schema.sh` re-introspects and produces an explicit diff PR. Schema drift is a code review event, not a silent break.

### OAuth scopes

| Scope | Why |
|-------|-----|
| `read` | List initiatives, projects, cycles, issues, comments |
| `write` | Update issue state, add comments |
| `app:assignable` | Houston AppUser can be assigned to issues |
| `app:mentionable` | Houston AppUser can be @-mentioned |
| `webhook:write` | Register webhook URL programmatically (Linear admin UI also acceptable) |

Tokens stored via macOS keychain, mutex-guarded refresh. Pattern matches existing Composio auth (`engine/houston-composio/src/auth.rs`).

### Webhook semantics

- Verification: HMAC-SHA256 over **raw** request body (not parsed JSON). Header: `Linear-Signature`.
- Replay defense: `Linear-Timestamp` header; reject deliveries older than 5 minutes.
- Idempotency: `webhookId` + `Linear-Delivery` headers; dedupe via `raw/webhook_events.jsonl` ledger.
- Delivery: at-least-once, no ordering. Engine re-projects idempotently from raw.
- Retry policy (Linear-side): 3 retries at +1m / +1h / +6h, then auto-disable. Polling reconciliation backstops.

### AgentSession protocol

Linear's 2026 agent-delegation protocol.

- **Registration**: on first OAuth install, engine calls `agentSessionRegister` → Houston declared as AppUser in the connected org.
- **Ingress**: Linear emits `AgentSessionEvent` when the AppUser is delegated to (assigned, mentioned, invited).
- **5s budget**: from event receipt to first response event back to Linear. Engine emits a `working` event within the budget, then completes asynchronously.
- **Egress events**: `working` → `thought` → `action` → `complete` | `error`.
- **Routing**: ingress consults `routing.json`:
  ```json
  {
    "rules": [
      { "match": { "team_uuid": "...", "labels": ["bug"] }, "agent": "Engineering/BugHunter" },
      { "match": { "project_uuid": "..." }, "agent": "Engineering/FeatureBuilder" }
    ],
    "default": "Engineering/Triage"
  }
  ```

### Rate-limit budgeter

Linear's quota: **3,000,000 complexity points per hour per OAuth app**. Per-query caps apply.

- Rolling token bucket in `engine/houston-linear/src/rate_limit.rs`.
- Explicit `first: N` on every paginated query (default 50 is multiplicative).
- Webhook-driven mutations prioritized over polling-driven refreshes when budget is tight.

## Webhook ingress flow (cloud relay)

Desktop engines can't expose public endpoints. `houston-relay/` Cloudflare Worker bridges.

```
Linear  →  https://tunnel.gethouston.ai/linear/webhook/{tunnelId}
            │
            ▼
        houston-relay (Worker)
            │ verify Linear-Signature HMAC at edge
            │ reject stale Linear-Timestamp
            │ dedupe by webhookId
            │ enqueue in Durable Object
            ▼
        existing reverse-tunnel WS
            │
            ▼
        houston-engine  →  /v1/trackers/linear/webhook  →  raw/webhook_events.jsonl
                                                          → project into issues.json etc.
                                                          → emit TrackerIssuesChanged event
```

See `docs/relay-operations.md` for relay deploy mechanics. The Linear route is C11 in the implementation plan.

## Adding a new tracker (post-rule-of-three checklist)

Only proceed when:
1. A second concrete tracker crate has been live in production for ≥1 month.
2. A third tracker is committed to the immediate roadmap.

Then:

```
□  Diff `engine/houston-linear` and `engine/houston-<#2>` public surfaces.
   Identify genuinely-common methods (list_issues, get_issue, update_state,
   add_comment, list_containers) vs provider-specific (cycles, sprints,
   agent_session, projects_v2 fields).

□  Create `engine/houston-tracker-port` crate with the common trait:
   pub trait TicketProvider {
       fn id(&self) -> TrackerProvider;
       fn capabilities(&self) -> &'static [Capability];
       async fn list_issues(&self, auth: &Auth, filter: IssueFilter) -> Result<...>;
       async fn get_issue(&self, auth: &Auth, id: &str) -> Result<...>;
       async fn update_issue_state(&self, auth: &Auth, id: &str, state: StateRef) -> Result<...>;
       async fn add_comment(&self, auth: &Auth, issue_id: &str, body: &str) -> Result<Comment>;
       fn verify_webhook(&self, headers: &HeaderMap, body: &[u8]) -> Result<WebhookEvent>;
   }

□  Capability marker traits for non-universal features:
   pub trait AgentSessionAware { ... }   // Linear today
   pub trait Sprintable { ... }          // Jira
   pub trait Cyclable { ... }            // Linear
   pub trait Projectable<V> { ... }      // GitHub Projects v2 variants

□  Refactor concrete crates to implement TicketProvider + applicable capability traits.

□  Adapter registry in engine-core:
   pub struct TrackerRegistry { adapters: HashMap<TrackerProvider, Arc<dyn TicketProvider>> }
   Replace direct `houston_linear::*` calls with registry dispatch.

□  Capability checks at call sites use `provider.capabilities().contains(&Capability::AgentSession)`
   for hashset-cheap gates; trait-object downcasts (`as_any().downcast_ref::<dyn AgentSessionAware>()`)
   only at the explicit Linear-specific code paths.

□  Tests: same trait test suite runs against each adapter. Per-capability test modules.

□  Do NOT collapse Linear's WorkflowState.type or Jira's status into a shared enum.
   Each adapter returns its provider-native state shape; the canonical `Ticket` type
   carries provider + raw state + (optional) normalized hint, not a flattened enum.
```

## Files of interest

| What | Where |
|------|-------|
| Linear GraphQL schema (vendored) | `engine/houston-linear/schema/linear.graphql` |
| cynic codegen build script | `engine/houston-linear/build.rs` |
| OAuth flow + keychain | `engine/houston-linear/src/auth.rs` |
| Webhook verification + idempotency | `engine/houston-linear/src/webhooks.rs` |
| AgentSession protocol | `engine/houston-linear/src/agent_session.rs` |
| Polling reconcile | `engine/houston-linear/src/reconcile.rs` |
| Rate-limit budgeter | `engine/houston-linear/src/rate_limit.rs` |
| Domain orchestration (routing, bridge) | `engine/houston-engine-core/src/linear/mod.rs` |
| Engine REST routes | `engine/houston-engine-server/src/routes/trackers.rs` |
| TrackerProvider enum + event variants | `engine/houston-engine-protocol/src/{lib,events}.rs` |
| Cloudflare Worker route | `houston-relay/src/worker.ts` (path `/linear/webhook/{tunnelId}`) |
| Schemas | `ui/agent-schemas/src/tracker_*.schema.json` (6 files) |
| TS wire types | `ui/engine-client/src/types.ts` |
| Board card variant | `ui/board/src/issue-card.tsx` or `app/src/components/tracker-issue-card.tsx` |
| Connect dialog | `app/src/components/connect-tracker-dialog.tsx` |
| Settings UI | `app/src/components/settings/tracker-settings.tsx` |
| Locales | `app/src/locales/{en,es,pt}/tracker.json` |
| Bug-report migration (existing Linear code) | `app/src-tauri/src/bug_report/linear*.rs` → thin callers into engine crate |
| Refresh script | `scripts/refresh-linear-schema.sh` |
| Spec | `docs/specs/2026-05-23-tracker-integration.html` |

## Composition with bstack primitives

When working in this code:

| Primitive | What it enforces here |
|-----------|----------------------|
| **Hygiene (P10)** | Worktree per chunk; clean tree at start of each. Multi-week project, easy to drift. |
| **Empirical (P11)** | Every verifiable behavior runs against a real Linear sandbox org — not synthetic. |
| **Persist (P12)** | Multi-week scope; use `persist iterate PROMPT.md` to survive context-window decay. |
| **Dep-Chain (P14)** | Every PR enumerates upstream files touched + downstream consumers affected. |
| **Snapshot (P15)** | Every PR opens with git/branch state + Linear-mirror state (cursor, last reconcile, open AgentSessions). |
| **Audience (P18)** | Specs → HTML in `docs/specs/`. KB references → markdown (this file). PR explainers for substantive PRs → HTML. |
| **Cross-Review (P20)** | All substantive PRs (> ~150 LOC or touching engine-core or routes) gated through cross-model adversarial review before merge. |

## Common operations

```bash
# Refresh vendored Linear GraphQL schema
bash scripts/refresh-linear-schema.sh

# Run Linear adapter tests in isolation
cargo test -p houston-linear --workspace

# Force reconcile from CLI (dev)
curl -X POST "http://127.0.0.1:$PORT/v1/trackers/linear/sync?workspacePath=..." \
     -H "Authorization: Bearer $TOKEN"

# Inspect raw webhook event ledger
tail -f ~/.houston/workspaces/<W>/<A>/.houston/trackers/linear/raw/webhook_events.jsonl

# Inspect projection
cat ~/.houston/workspaces/<W>/<A>/.houston/trackers/linear/issues.json | jq '.[] | {id, identifier, state, assignee}'

# Check sync state
cat ~/.houston/workspaces/<W>/<A>/.houston/trackers/linear/sync_state.json | jq

# Verify cloud-relay end-to-end (dev tunnel)
curl -X POST "https://tunnel.gethouston.ai/linear/webhook/$TUNNEL_ID" \
     -H "Linear-Signature: $SIG" -H "Linear-Timestamp: $TS" \
     -d @fixtures/linear_issue_update.json
```

## What NOT to do in this code

- Add `engine/houston-tracker-port` crate before rule-of-three triggers (2 shipped + 3rd on roadmap).
- Add `Option<sprint_id>` / `Option<cycle_id>` / `Option<milestone_id>` parameters to any shared trait method. This IS the wrong-abstraction failure mode.
- Collapse Linear's `WorkflowState.type` into Houston's 4-status activity enum. Linear's vocabulary is richer; keep it.
- Bypass the raw layer when writing webhook-received data. Always write raw first, then project.
- Rename `tracker:linear:<ws>` topics to `linear:<ws>`. The provider-tagged form is the contract.
- Use the Composio Linear MCP path for new structural features. Composio stays as the escape hatch when OAuth not connected, nothing else.
- Hard-code Linear-specific URLs in routes. Use the `provider` path param.
- Trust webhook payloads as ordered. Re-project from raw is the only safe pattern.
- Ship without `cargo test -p houston-linear` green AND a real-sandbox dogfood receipt.

## Cross-references

- Full spec: [`docs/specs/2026-05-23-tracker-integration.html`](../docs/specs/2026-05-23-tracker-integration.html)
- Houston architecture: [`knowledge-base/architecture.md`](architecture.md)
- Wire protocol conventions: [`knowledge-base/engine-protocol.md`](engine-protocol.md)
- Filesystem conventions: [`knowledge-base/files-first.md`](files-first.md)
- Auth (existing patterns): [`knowledge-base/auth.md`](auth.md)
- Relay operations: [`docs/relay-operations.md`](../docs/relay-operations.md)
- Existing Linear bug-report code (to be migrated): `app/src-tauri/src/bug_report/linear*.rs`
- Composio MCP (secondary path): `engine/houston-composio/src/mcp.rs` (`linear` toolkit entry at line 381+437+515)

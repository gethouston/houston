# @houston/protocol — wire contract v3

The ONE protocol for the Houston host, every deployment. The frontend talks
ONLY to the host (local profile on 127.0.0.1, cloud profile behind the
control-plane URL). Runtimes are internal components behind the host; their
conversation core (`/version` → `protocol: 2`) is re-served by the host
verbatim under `/v1/agents/:id/conversations/*`.

Consumers: the host (`packages/control-plane` → host), `@houston/runtime-client`
(re-exports the conversation subset), `@houston-ai/engine-client` (the UI's
client, rewritten onto this in convergence P2/P6). See `convergence/README.md`.

## Route surface (v3)

```
/v1/health /version /capabilities
/v1/events                                    WS/SSE — global HoustonEvent firehose
/v1/workspaces                                CRUD
/v1/agents                                    CRUD (+ color, rename)
/v1/agents/:id/conversations                  list
/v1/agents/:id/conversations/:cid             PATCH rename · DELETE
/v1/agents/:id/conversations/:cid/messages    GET history · POST send (202)
/v1/agents/:id/conversations/:cid/events      SSE (WireEvent, id-scoped)
/v1/agents/:id/conversations/:cid/cancel      POST
/v1/agents/:id/conversations/:cid/title       POST — LLM title
/v1/agents/:id/files/*                        list/read/write/rename/delete/download
/v1/agents/:id/skills                         list/create/save/delete
/v1/agents/:id/routines                       CRUD + /runs
/v1/agents/:id/activities                     CRUD
/v1/agents/:id/config                         GET/PUT
/v1/providers                                 connect-once: status/login/complete/logout
/v1/preferences /attachments /portable /store
/sandbox/credential                           runtime-facing (HMAC sandbox token)
```

Typed-family list GETs (`activities`, `routines`, `routine_runs`, `learnings`,
and `config`) return an envelope — `{ items, diagnostics }` / `{ config,
diagnostics }` — because agents write these files with file tools: malformed
entries are dropped AND reported, never silently lost (beta policy).

Activity delete is idempotent. `DELETE /v1/agents/:id/activities/:activityId`
returns `200 { ok: true, deleted: boolean }`; a repeated delete of the same
activity is `deleted: false`, not a 404.

Families not yet typed here (added with their P3 slice): attachments, portable
agents, store listings. Rust-CLI-era DTOs (Composio, Claude-installer,
CLI install sources, worktree/shell) die with the Rust engine and are
deliberately absent.

## Rules

- Shapes that survived from v1 are field-identical to v1 (wire mirrors the
  on-disk `.houston` schemas; snake_case families stay snake_case) so the
  engine-client rewrite is transport-only.
- UI gates affordances on `GET /v1/capabilities`, never on deployment checks.
- Internal code gets no backwards compat: protocol changes land everywhere in
  one PR. User DATA compat is a different rule and lives in migrations.

# @houston/protocol — wire contract v3

The ONE protocol for the Houston host, every deployment. The frontend talks
ONLY to the host (local profile on 127.0.0.1, cloud profile behind the
host URL). Runtimes are internal components behind the host; their
conversation core (`/version` → `protocol: 2`) is re-served by the host
verbatim under `/v1/agents/:id/conversations/*`.

Consumers: the host (`packages/host`), `@houston/runtime-client`
(re-exports the conversation subset) and `@houston/engine-adapter` (the client
every frontend makes its requests through).

## Route surface (v3)

The routes themselves are declared beside their handlers in
`packages/host/src/routes/registry` and enumerated by `listRoutes()`;
`packages/host/src/routes/routes.golden.json` is the replayed record of what
answers what. This package holds the SHAPES those routes carry, not a second
copy of the table.

Typed-family list GETs (`activities`, `routines`, `routine_runs`, `learnings`,
and `config`) return an envelope — `{ items, diagnostics }` / `{ config,
diagnostics }` — because agents write these files with file tools: malformed
entries are dropped AND reported, never silently lost (beta policy).

Activity delete is idempotent. `DELETE /v1/agents/:id/activities/:activityId`
returns `200 { ok: true, deleted: boolean }`; a repeated delete of the same
activity is `deleted: false`, not a 404.

A refused file operation carries a `FileOpCode` (`src/domain/file-refusal.ts`):
`name_taken` when a rename or move would land on an occupied name, `read_only`
when the workspace itself cannot be written. `ATOMIC_TMP_SUFFIX`
(`src/scratch.ts`) is the one name every Houston process gives a half-written
file, so the store sync and the Files listing skip exactly those.

## Rules

- The wire mirrors the on-disk `.houston` schemas; snake_case families stay
  snake_case.
- UI gates affordances on `GET /v1/capabilities`, never on deployment checks.
- Internal code gets no backwards compat: protocol changes land everywhere in
  one PR. User DATA compat is a different rule and lives in migrations.

# Open / Closed Boundary

Houston runs ONE host with two adapter profiles: **local** (desktop) and
**cloud**. The closed cloud adapters have been **extracted** into a separate
package so the eventual OSS split is a clean directory move:

| Package                | Visibility | Holds                                                                                       |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| **`packages/host`**    | OPEN       | the server builder, ports, ALL domain route handlers, the open adapters, the LOCAL entry    |
| **`packages/host-cloud`** | CLOSED  | the concrete cloud adapters (Postgres / GCS / GKE / Redis / BigQuery), the operator-admin surface, and the CLOUD `main.ts` |

`packages/host-cloud` depends on `@houston/host` (`file:../host`). The dependency
direction is **ONE-WAY**: `host-cloud → host`, never the reverse.

`scripts/check-boundaries.mjs` enforces this (`pnpm check:boundaries`, exit 1 on a
leak).

## The one-way rule

> **CLOSED may import OPEN. OPEN must NEVER import CLOSED.**

Open code (`packages/host` included) depends only on ports (interfaces). The
concrete cloud adapter is constructed in exactly one place — the cloud wiring
point (`packages/host-cloud/src/main.ts`) — and injected behind a port. Any open
file reaching for a cloud library or `@houston/host-cloud` is a leak.

## Open (future "Houston")

Pure / local / deployment-agnostic. Must contain **zero** cloud-library imports
and **zero** imports of `@houston/host-cloud` (except the one documented runtime
adapter below).

| Path                       | Role                                                            |
| -------------------------- | -------------------------------------------------------------- |
| `packages/protocol`        | v3 wire types + zod                                            |
| `packages/domain`          | `.houston` layout, schemas, cron, portable logic              |
| `packages/runtime`         | the **pi** engine (the only agent loop) — runs desktop AND cloud |
| `packages/runtime-client`  | typed client for the runtime                                  |
| `packages/host`            | the OPEN host: server builder, ports, route handlers, open adapters, LOCAL entry |
| `ui/**`                    | `@houston-ai/*` React packages (props-only)                   |

Inside **`packages/host`**, every file is OPEN. It exposes its internals to
`host-cloud` through the `"./src/*"` subpath in its `package.json` `exports`, so
the closed package imports e.g. `@houston/host/src/ports`,
`@houston/host/src/server`, `@houston/host/src/launcher/names`. The shared
adapter-contract suites (`@houston/host/src/testing/*-contract.ts`) live here too
and are imported by BOTH the open adapter tests and the closed adapter tests.

> `credentials/refresh.ts` is **open shared host logic** (pure OAuth token
> refresh via `fetch`, zero cloud libs). `turn/start-turn.ts` and
> `routes/credential.ts` import it legitimately.

## Closed (future "Houston Cloud") — `packages/host-cloud`

The concrete cloud adapters + the operator-admin surface + the cloud wiring
point. The whole package is closed; it may import cloud libs and `@houston/host`
freely.

| File                                              | Cloud coupling           |
| ------------------------------------------------- | ------------------------ |
| `packages/host-cloud/src/store/pg.ts`             | `pg` (Postgres)          |
| `packages/host-cloud/src/credentials/store-pg.ts` | `pg` (Postgres) — connect-once credential store |
| `packages/host-cloud/src/integrations/credential-store-pg.ts` | `pg` (Postgres) — integration-credential store |
| `packages/host-cloud/src/vfs/gcs.ts`              | `@google-cloud/storage`  |
| `packages/host-cloud/src/launcher/gke.ts`         | `@kubernetes/client-node`|
| `packages/host-cloud/src/launcher/reconcile.ts`   | `@kubernetes/client-node` |
| `packages/host-cloud/src/launcher/manifest.ts`    | `@kubernetes/client-node` (k8s object builders) |
| `packages/host-cloud/src/turn/bus-redis.ts`       | `ioredis`                |
| `packages/host-cloud/src/admin/cluster.ts`        | `@kubernetes/client-node`|
| `packages/host-cloud/src/admin/billing.ts`        | BigQuery (googleapis)    |
| `packages/host-cloud/src/admin/overview.ts`       | operator dashboard       |
| `packages/host-cloud/src/admin/quantity.ts`       | operator dashboard helpers |
| `packages/host-cloud/src/auth/verify-supabase.ts` | `jose` (Supabase JWT/JWKS) + `makeTokenVerifier` |
| `packages/host-cloud/src/routes/admin.ts`         | the operator route (`handleAdmin`) |
| `packages/host-cloud/src/main.ts`                 | the CLOUD wiring point (constructs every cloud adapter, injects admin) |
| `packages/host-cloud/scripts/run-migration.ts`    | `pg` — the cloud-ops Postgres migration runner |
| `packages/runtime/src/turn/gcs-store.ts`          | `@google-cloud/storage` — the runtime's own cloud adapter (the pi engine ships to cloud too) |

### The admin-injection seam

The open server builder (`createControlPlaneServer`) does NOT import the admin
route. `ControlPlaneDeps` carries an optional `mountAdmin?` request hook; the
open server calls it after the events stream and 404s `/admin/*` when it is
absent (the LOCAL default). The cloud `main.ts` binds `handleAdmin` (closing over
the closed `AdminDeps` + the workspace store) and passes it as `mountAdmin`. Route
logic lives once, in the closed `routes/admin.ts` — no duplication.

### Mixed files were split (was Wave-5 TODO, now DONE)

The three formerly-mixed modules are split across the seam:

- **`credentials/store.ts`** → `MemoryCredentialStore` stays OPEN
  (`packages/host`); `PgCredentialStore` moved to
  `packages/host-cloud/src/credentials/store-pg.ts`.
- **`vfs/index.ts`** → the open barrel (`FsVfs`/`MemoryVfs`/`Vfs` port) stays in
  `packages/host`; `GcsVfs` moved to `packages/host-cloud/src/vfs/gcs.ts` (its
  consumers import it from there).
- **`auth/verify.ts`** → `DevTokenVerifier`/`SingleUserVerifier`/
  `ServiceTokenVerifier` + `stripBearer`/`parseServiceTokens` stay OPEN;
  `SupabaseTokenVerifier` + `makeTokenVerifier` moved to
  `packages/host-cloud/src/auth/verify-supabase.ts`.

The shared adapter CONTRACT functions were extracted to
`packages/host/src/testing/*-contract.ts` (OPEN) and are imported by both the open
adapter tests (Memory/Fs/Local/Process) and the closed adapter tests
(Pg/Gcs/Redis/Gke, in `packages/host-cloud`).

## What the check enforces

`scripts/check-boundaries.mjs` walks every non-test `.ts`/`.tsx` under the open
packages (including `packages/host`) and the closed package, **strips comments**
(so a commented-out import is never mistaken for a real one), extracts every
`import` / `export ... from` / dynamic `import()` / `require()` specifier, and
also reads the open packages' `package.json` files. It then enforces:

> **Test scaffolding is exempt.** `*.test.ts`, plus test-only helpers by
> convention (`*-harness.ts`, `*.test-helper.ts`, `*.fixture.ts`, `*.mock.ts`),
> may import a closed adapter or cloud lib directly — they exercise the cloud
> adapters in unit tests and are never shipped. Production code may not.

- **Rule A** — no file in `packages/{protocol,domain,runtime,runtime-client,host}`
  or `ui/**` may _reach_ the closed package or a cloud lib. A reach is ANY of:
  - a bare `@houston/host-cloud` (or subpath) specifier;
  - a **relative or absolute path** that, resolved on disk, lands inside
    `packages/host-cloud/` — host and host-cloud are on-disk siblings and
    host-cloud has no `exports` field, so `../../host-cloud/src/launcher/gke`
    resolves and must be caught even though the bare spec never appears;
  - a known **cloud lib**: `pg`, `postgres` (postgres.js), `ioredis`, `redis`,
    `mongodb`, `@google-cloud/*`, `@kubernetes/*`, `@aws-sdk/*`, `@azure/*`,
    `googleapis`, `bigquery`;
  - an **undeclared bare import** — any non-builtin specifier that is not a
    dependency of the importing file's own `package.json`. This is the allowlist
    half: a future cloud dep the denylist has never heard of cannot be imported
    without first being declared, where Rule C then sees it.

  The one allowlisted exception is the runtime's own adapter
  (`runtime/src/turn/gcs-store.ts`), reachable only from `runtime/src/main.ts`;
  those two files may import `@google-cloud/storage`.
- **Rule B** — `packages/host-cloud/**` is wholesale CLOSED: it may import cloud
  libs and `@houston/host`. The check walks it only to confirm it carries the
  extracted adapters (a stray empty package can't pass as "extracted").
- **Rule C (manifest)** — no open `package.json` may **declare** the closed
  package or a cloud lib as a dependency (any bucket: `dependencies`,
  `devDependencies`, `peerDependencies`, `optionalDependencies`). This is the
  allowlist direction: a denylist of import specifiers lets a new cloud dep leak
  green by default, but a dependency must be declared to resolve, and a
  declaration is a small, reviewable surface. The runtime's `@google-cloud/storage`
  is the one documented exception.

Violations print as `[A|B|C] file -> reason` and exit 1. On success it prints a
one-line OK with open/closed file counts, the allowlisted-crossing count, and the
number of clean open manifests.

The check is regression-tested by `scripts/test/check-boundaries.test.sh` (a
fixture tree exercising every leak vector above).

Run: `pnpm check:boundaries` (or `node scripts/check-boundaries.mjs`).

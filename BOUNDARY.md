# Open / Closed Boundary

Houston is converging to ONE host (`packages/control-plane`, soon `packages/host`)
with two adapter profiles: **local** (desktop) and **cloud**. After convergence
the repo splits into two:

| Repo               | Visibility | Holds                                                                 |
| ------------------ | ---------- | --------------------------------------------------------------------- |
| **Houston**        | OPEN       | the pure/local stack + the host's router, ports, handlers, local profile |
| **Houston Cloud**  | CLOSED     | the cloud adapters (Postgres / GCS / GKE / Redis / BigQuery), the operator-admin surface, and deploy/infra |

The seam is the **hexagonal ports boundary**. This document is the manifest;
`scripts/check-boundaries.mjs` enforces it (`pnpm check:boundaries`, exit 1 on a
leak). No files move yet — extraction is a later wave. We lock the seam now so it
can't drift before the split.

## The one-way rule

> **CLOSED may import OPEN. OPEN must NEVER import CLOSED.**

Open code depends only on ports (interfaces). The concrete cloud adapter is
constructed in exactly one place — the wiring point (`main.ts`) — and injected.
Any open file reaching for a cloud library or a concrete adapter is a leak.

## Open (future "Houston")

Pure / local / deployment-agnostic. Must contain **zero** cloud-library imports
(except the one documented runtime adapter below).

| Path                       | Role                                                            |
| -------------------------- | -------------------------------------------------------------- |
| `packages/protocol`        | v3 wire types + zod                                            |
| `packages/domain`          | `.houston` layout, schemas, cron, portable logic              |
| `packages/runtime`         | the **pi** engine (the only agent loop) — runs desktop AND cloud |
| `packages/runtime-client`  | typed client for the runtime                                  |
| `ui/**`                    | `@houston-ai/*` React packages (props-only)                   |

Inside the **host** (`packages/control-plane`), these are OPEN too — they import
ports, never cloud adapters:

`routes/**`, `domain/**`, `schedule/**`, `channel/**`, `events/**`, `watch/**`,
`local/**`, `proxy/**`, `migrate/**`, `integrations/**`, `ports.ts`,
`config.ts`, `server.ts`, `capabilities.ts`, `paths.ts`, `houston-prompt.ts`,
`providers.ts`, `feedback.ts`, `sidecar-entry.ts`, `shutdown.ts`, and the
shared adapter ports (`vfs/vfs.ts`, `vfs/fs.ts`, `vfs/memory.ts`,
`store/local.ts`, `store/memory.ts`, `turn/bus.ts` [`MemoryTurnBus`],
`credentials/refresh.ts` [shared OAuth refresh logic], `launcher/process.ts`,
`launcher/fake.ts`, `launcher/bun-spawner.ts`, `launcher/names.ts`,
`launcher/manifest.ts` builders consumed only via `gke.ts`).

> `credentials/refresh.ts` is **open shared host logic** (pure OAuth token
> refresh via `fetch`, zero cloud libs). It was previously assumed cloud — it is
> not. `turn/start-turn.ts` and `routes/credential.ts` import it legitimately.

## Closed-destined (future "Houston Cloud")

Concrete cloud adapters + the operator-admin surface. The check forbids OPEN
code from importing these, and forbids non-allowlisted HOST code from importing
them.

| File                                          | Cloud coupling           |
| --------------------------------------------- | ------------------------ |
| `packages/control-plane/src/store/pg.ts`      | `pg` (Postgres)          |
| `packages/control-plane/src/vfs/gcs.ts`       | `@google-cloud/storage`  |
| `packages/control-plane/src/launcher/gke.ts`  | `@kubernetes/client-node`|
| `packages/control-plane/src/launcher/reconcile.ts` | `@kubernetes/client-node` (apiserver reconcile used by GkeLauncher) |
| `packages/control-plane/src/launcher/manifest.ts`  | `@kubernetes/client-node` (k8s object builders) |
| `packages/control-plane/src/turn/bus-redis.ts`| `ioredis`                |
| `packages/control-plane/src/admin/cluster.ts` | `@kubernetes/client-node`|
| `packages/control-plane/src/admin/billing.ts` | BigQuery (googleapis)    |
| `packages/control-plane/src/admin/overview.ts`| operator dashboard       |
| `packages/control-plane/src/admin/quantity.ts`| operator dashboard helpers |
| `packages/runtime/src/turn/gcs-store.ts`      | `@google-cloud/storage` — the runtime's own cloud adapter (the pi engine ships to cloud too) |

> **Note on paths from the original brief.** There is **no** `launcher/cloudrun.ts`
> — "cloudrun" is a runtime *string value* in `config.ts`; per-turn Cloud Run
> hosting lives in `turn/**`. There is **no** `auth/supabase.ts` — the Supabase
> verifier is `SupabaseTokenVerifier` inside the MIXED file `auth/verify.ts`
> (see below). Two extra closed `@kubernetes` files (`launcher/reconcile.ts`,
> `launcher/manifest.ts`) were discovered and added.

### Import allowlist (who may import a closed file)

The wiring points, the closed surface itself, and the admin surface:

- `packages/control-plane/src/main.ts` — the host wiring point; constructs every
  cloud adapter (`PgWorkspaceStore`, `GcsVfs`, `GkeLauncher`, `RedisTurnBus`,
  `BigQueryBillingReader`, `GkeClusterReader`, `PgCredentialStore`) and injects
  them behind ports.
- `packages/control-plane/src/routes/admin.ts` — the operator-dashboard route;
  part of the closed admin surface, imports only `admin/**`.
- `packages/control-plane/src/admin/**` — intra-admin imports + k8s/BigQuery.
- the closed files themselves — `gke.ts → reconcile.ts → manifest.ts`, etc.
- `packages/runtime/src/main.ts` — the runtime wiring point; constructs
  `GcsStore` (cloud) or `LocalDirStore` (local) behind the `ObjectStore` port via
  a dynamic `import()`.

## Wave-5 split TODO (mixed files)

These export BOTH an open and a closed symbol, so they can't sit on one side of
the seam yet. They are tolerated by the check today (listed in `MIXED_FILES`)
and surfaced in its success line. When `packages/host-cloud` is extracted, each
must be cleanly split and removed from `MIXED_FILES`:

- [ ] **`packages/control-plane/src/credentials/store.ts`**
      — `MemoryCredentialStore` (OPEN) + `PgCredentialStore` (CLOSED,
      `import type { Pool } from "pg"`).
      Split: keep `MemoryCredentialStore` open (e.g. `store-memory.ts`); move
      `PgCredentialStore` to the closed side (e.g. `store-pg.ts`).
- [ ] **`packages/control-plane/src/vfs/index.ts`**
      — barrel re-exporting `FsVfs`/`MemoryVfs` (OPEN) + `GcsVfs` (CLOSED).
      Split: an open barrel (`fs` + `memory` + `vfs` port) and a closed export
      of `GcsVfs`; `main.ts` imports `GcsVfs` from the closed file directly.
- [ ] **`packages/control-plane/src/auth/verify.ts`**
      — `DevTokenVerifier` / `SingleUserVerifier` / `ServiceTokenVerifier` +
      `makeTokenVerifier`/`parseServiceTokens` (OPEN; `local/host.ts` imports
      `SingleUserVerifier`) + `SupabaseTokenVerifier` (CLOSED, Supabase/JWKS).
      Split: move `SupabaseTokenVerifier` (and the `makeTokenVerifier` cloud
      branch) to the closed side; keep the local/dev/service verifiers open.
      `makeTokenVerifier` becomes a wiring concern in `main.ts`.

Because these are mixed (not pure-closed), the check does **not** yet flag the
open code that imports their open exports (`local/host.ts → SingleUserVerifier`,
the Memory stores in tests, the `vfs` barrel from `main.ts`). After the split,
remove them from `MIXED_FILES` and the check will hold the new, clean files to
the full one-way rule automatically.

## What the check enforces

`scripts/check-boundaries.mjs` walks every non-test `.ts`/`.tsx` under the open
packages and the host, extracts import/export/dynamic-import specifiers, and:

- **Rule A** — no file in `packages/{protocol,domain,runtime,runtime-client}` or
  `ui/**` imports a cloud lib (`pg`, `ioredis`, `redis`, `@google-cloud/*`,
  `@kubernetes/*`, `googleapis`, `bigquery`) or a closed-destined file. The one
  allowlisted exception is the runtime's own adapter
  (`runtime/src/turn/gcs-store.ts`), reachable only from `runtime/src/main.ts`.
- **Rule B** — inside `packages/control-plane`, only the import allowlist above
  may import a closed-destined adapter file (or a cloud lib directly). Every
  other host file doing so is a violation.

Violations print as `file -> imported closed module` and exit 1. On success it
prints a one-line OK with file/adapter/crossing/mixed counts.

Run: `pnpm check:boundaries` (or `node scripts/check-boundaries.mjs`).

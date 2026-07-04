# Open / Closed Boundary

Houston runs ONE host with two adapter profiles: **local** (desktop) and
**cloud**. Everything in THIS repository is **OPEN**. The CLOSED control plane
(`@houston/host-cloud` — the concrete cloud adapters Postgres / GCS / GKE /
Redis / BigQuery, the operator-admin surface, and the cloud `main.ts`) **moved
out of this repository** to its private home, which vendors this repo as a
git submodule at a pinned SHA and builds against the ports defined here.

The dependency direction is **ONE-WAY**: `host-cloud → host`, never the
reverse. `scripts/check-boundaries.mjs` enforces the open side of that seam
(`pnpm check:boundaries`, exit 1 on a leak).

## The one-way rule

> **CLOSED (out-of-repo) may import OPEN. OPEN must NEVER import CLOSED.**

Open code (`packages/host` included) depends only on ports (interfaces). The
concrete cloud adapters are constructed in exactly one place — the closed
repo's cloud wiring point — and injected behind ports. Any open file reaching
for a cloud library or `@houston/host-cloud` is a leak.

## Open — everything here

Pure / local / deployment-agnostic. Must contain **zero** cloud-library imports
and **zero** imports of `@houston/host-cloud` (except the one documented runtime
adapter below).

| Path                       | Role                                                            |
| -------------------------- | --------------------------------------------------------------- |
| `packages/protocol`        | v3 wire types + zod                                             |
| `packages/domain`          | `.houston` layout, schemas, cron, portable logic                |
| `packages/runtime`         | the **pi** engine (the only agent loop) — runs desktop AND cloud |
| `packages/runtime-client`  | typed client for the runtime                                     |
| `packages/host`            | the OPEN host: server builder, ports, route handlers, open adapters, LOCAL entry |
| `ui/**`                    | `@houston-ai/*` React packages (props-only)                      |

Inside **`packages/host`**, every file is OPEN. It exposes its internals to the
closed control plane through the `"./src/*"` subpath in its `package.json`
`exports` — the closed repo imports e.g. `@houston/host/src/ports`,
`@houston/host/src/server`, `@houston/host/src/launcher/names`. Treat that
subpath as the closed side's contract surface: renames/moves under
`packages/host/src` are seam changes (land here first, then the closed repo
bumps its pin and adapts). The shared adapter-contract suites
(`@houston/host/src/testing/*-contract.ts`) live here too and are imported by
BOTH the open adapter tests and the closed adapter tests.

> `credentials/refresh.ts` is **open shared host logic** (pure OAuth token
> refresh via `fetch`, zero cloud libs). `turn/start-turn.ts` and
> `routes/credential.ts` import it legitimately.

### The admin-injection seam

The open server builder (`createControlPlaneServer`) does NOT import any admin
route. `ControlPlaneDeps` carries an optional `mountAdmin?` request hook; the
open server calls it after the events stream and 404s `/admin/*` when it is
absent (the LOCAL default). The closed cloud `main.ts` binds its operator-admin
handler and passes it as `mountAdmin`. Route logic lives once, on the closed
side — no duplication here.

### The one open cloud exception

The runtime ships to cloud too, so it carries a single GcsStore adapter behind
the ObjectStore port: `packages/runtime/src/turn/gcs-store.ts`, constructed via
a dynamic `import()` in `packages/runtime/src/main.ts`. Those two files (and
the runtime's matching `@google-cloud/storage` dependency declaration) are the
one allowlisted crossing.

## What the check enforces

`scripts/check-boundaries.mjs` walks every non-test `.ts`/`.tsx` under the open
packages (including `packages/host`), **strips comments** (so a commented-out
import is never mistaken for a real one), extracts every `import` /
`export ... from` / dynamic `import()` / `require()` specifier, and also reads
the open packages' `package.json` files. It then enforces:

> **Test scaffolding is exempt.** `*.test.ts`, plus test-only helpers by
> convention (`*-harness.ts`, `*.test-helper.ts`, `*.fixture.ts`, `*.mock.ts`),
> may import a cloud lib directly — they exercise adapters in unit tests and
> are never shipped. Production code may not.

- **Rule A** — no file in `packages/{protocol,domain,runtime,runtime-client,host}`
  or `ui/**` may _reach_ the closed package or a cloud lib. A reach is ANY of:
  - a bare `@houston/host-cloud` (or subpath) specifier;
  - a **relative or absolute path** that resolves under the closed package's
    former `packages/host-cloud/` path;
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
- **Rule B** — `packages/host-cloud/` must **not exist** in this repository.
  The closed control plane moved out; anything reappearing under that path
  would silently re-publish closed code.
- **Rule C (manifest)** — no open `package.json` may **declare** the closed
  package or a cloud lib as a dependency (any bucket: `dependencies`,
  `devDependencies`, `peerDependencies`, `optionalDependencies`). This is the
  allowlist direction: a denylist of import specifiers lets a new cloud dep leak
  green by default, but a dependency must be declared to resolve, and a
  declaration is a small, reviewable surface. The runtime's `@google-cloud/storage`
  is the one documented exception.

Violations print as `[A|B|C] file -> reason` and exit 1. On success it prints a
one-line OK with the open file count, the allowlisted-crossing count, and the
number of clean open manifests.

The check is regression-tested by `scripts/test/check-boundaries.test.sh` (a
fixture tree exercising every leak vector above).

Run: `pnpm check:boundaries` (or `node scripts/check-boundaries.mjs`).

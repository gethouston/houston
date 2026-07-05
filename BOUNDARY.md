# Open / Closed Boundary

Everything in this repository is **OPEN** and deployment-agnostic. The CLOSED
multi-tenant control plane (`@houston/host-cloud` — the concrete cloud adapters
Postgres / GCS / GKE / Redis / BigQuery, the operator-admin surface, and the
cloud `main.ts`) was **RETIRED and deleted**: the shipped Houston Cloud is a
private gateway plus one engine pod per agent, and those pods run this repo's
open host + runtime — the same code as the desktop app. The multi-tenant host
was an architecture Houston moved past; it survives in git history if it is
ever needed again.

The boundary rules remain load-bearing after the retirement: they are what
keeps this repo free of cloud libraries, so the one host stays runnable
anywhere (desktop, engine pod, self-host) and closed cloud policy can only
ever live behind ports. `scripts/check-boundaries.mjs` enforces this
(`pnpm check:boundaries`, exit 1 on a leak).

## The one-way rule

> **CLOSED (private, out-of-repo) may build on OPEN. OPEN must NEVER import
> anything closed.**

Open code (`packages/host` included) depends only on ports (interfaces). Any
concrete cloud adapter is constructed outside this repo and injected behind a
port. Any open file reaching for a cloud library or `@houston/host-cloud` is a
leak.

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

Inside **`packages/host`**, every file is OPEN. Its `package.json` `exports`
keeps the `"./src/*"` subpath open — historically the closed control plane's
contract surface, and still the extension surface any private deployment glue
would build against. The shared adapter-contract suites
(`@houston/host/src/testing/*-contract.ts`) live here and keep every adapter
implementation honest against the same behavioral contract.

> `credentials/refresh.ts` is **open shared host logic** (pure OAuth token
> refresh via `fetch`, zero cloud libs). `turn/start-turn.ts` and
> `routes/credential.ts` import it legitimately.

### The admin-injection seam

The open server builder (`createControlPlaneServer`) does NOT import any admin
route. `ControlPlaneDeps` carries an optional `mountAdmin?` request hook; the
open server calls it after the events stream and 404s `/admin/*` when it is
absent (the default — and, since the closed control plane's retirement, the
only in-tree behavior). The hook stays: it is the documented extension point
for any future closed admin surface, injected rather than imported.

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
  The closed control plane was retired and deleted; anything reappearing under
  that path would silently re-publish closed code.
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

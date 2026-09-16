# @houston/host

Open Houston host. One frontend-facing server for both deployment profiles:
local desktop/web and cloud. It owns the protocol v3 router, auth seam, domain
routes, scheduler, event stream, credential serve, integrations proxy, and the
ports that hide deployment-specific adapters.

Everything here is OPEN and deployment-agnostic. The closed multi-tenant cloud
adapters (`@houston/host-cloud`) were retired and deleted — the shipped cloud is
a private gateway plus one engine pod per agent running this same host — and any
private deployment glue builds against the ports and the `"./src/*"` exports
subpath from outside this repo. See `BOUNDARY.md`.

The package is pnpm-managed and frontend-agnostic. Bun is not required for dev,
tests, or Docker runtime; it is only used by `scripts/build-host-sidecar.sh` when
compiling the desktop host-sidecar binary.

## Shape

```
src/
  server.ts            createControlPlaneServer; CORS, the 401 wall, the chain
  server-phases.ts     walks the group table: public+sandbox -> user -> agent
  routes/registry/     the group table, the matcher, the dispatcher
  routes/              account, agents, data families, skills, portable, integrations
  ports.ts             WorkspaceStore, RuntimeChannel, CredentialStore, Vfs seams
  domain/              workspace, agent, access types
  local/               local profile entry + FS/subprocess adapters
  store/               open memory/local workspace stores
  credentials/         file/memory credential stores + sandbox-token vault
  turn/                per-turn dispatch helpers, quota, attachments, files
  events/              /v1/events hub
  watch/               local FS watcher -> HoustonEvent
  schedule/            routine scheduler + firer
  integrations/        Composio REST integration provider port + adapter
  vfs/                 open Vfs port + memory/FS adapters
  assistant/           the AI Manager catalog, entity directory, served set
```

`vfs/` is where a workspace's file semantics live: `keyCase()` probes the
filesystem's own folding and unicode normalization (it has to write to answer),
`exists()` and `VfsExistsError` are how a move or rename onto an occupied name
becomes a `409 name_taken` instead of an overwrite, and half-written files carry
`ATOMIC_TMP_SUFFIX` so the walk and the listing both skip them.

`assistant/served-operations.ts` derives what THIS deployment can do by probing
the catalog's routes against the live route registry. A desktop has no spaces,
teams or billing, and the AI Manager is told so rather than discovering it as a
404 mid-sentence. Never a hand-kept list.

The exported builder is named `createControlPlaneServer`.

Route modules declare themselves beside their handler; `server.ts` holds no
route list. It walks `routes/registry/groups.ts`'s `GROUP_PHASES` table
(`server-phases.ts`), and `routes/registry/` matches and dispatches whatever the
modules registered.

## Adding a route

1. Declare it beside its handler with `defineRoute`, `defineRouteFamily` or
   `defineProxyFamily` (`routes/registry/define.ts`).
2. Import the module in `routes/registry/all.ts`. A module missing from that
   barrel is unreachable and unchecked.
3. Its chain slot is its group's line in `routes/registry/groups.ts`'s
   `GROUP_PHASES`: position there is match order, and the last agent-phase group
   claims every remaining `/agents/:agentId/…` path for the agent's engine.
4. `routes/routes-golden.test.ts` pins the routing answers. Re-record with
   `HOUSTON_ROUTES_GOLDEN=update` only alongside a diff justified in the PR body.
5. `pnpm check` runs `check:sdk-parity`; `scripts/sdk-parity-exceptions.json`
   may only shrink.

## Design Rules

- Runtime stays single-workspace and tenancy-free. The host owns identity,
  routing, credentials, and deployment lifecycle.
- Domain route logic lives once. Local and cloud behavior changes only through
  injected ports and capabilities.
- Open code never imports a cloud library or closed adapter. `pnpm
  check:boundaries` enforces that seam.
- The local profile is the same host server with local adapters: FS store/Vfs,
  subprocess runtime launcher, single-user verifier, in-process bus, and FS
  watcher.

## Run

```bash
pnpm install
cd packages/host
pnpm dev          # local desktop/web host, src/local/main.ts, serves :4318
```

The cloud profile is this same server wired by the private gateway repo's
deployment (one engine pod per agent); there is no in-repo cloud entry point.

The full desktop/web + host dev loop is `pnpm dev` from the repo root (root
`CLAUDE.md` → Dev loop); this pane logs to `~/.dev-houston/logs/dev-host.log`.

## Test

```bash
cd packages/host
pnpm test && pnpm typecheck
```

The parity gates run from the repo root: `pnpm check` (`check:sdk-parity`,
`check:assistant-catalog`, `check:assistant-coverage`) and
`pnpm check:boundaries`.

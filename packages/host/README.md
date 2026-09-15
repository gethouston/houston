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
```

The exported builder is still named `createControlPlaneServer`; renaming the
internal symbol is tracked in `convergence/follow-ups.md`.

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

See `convergence/README.md` for the full desktop/web + host local dev loop.

## Test

```bash
cd packages/host
pnpm test && pnpm typecheck
```

See `convergence/README.md` for architecture and parity gates.

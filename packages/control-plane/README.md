# @houston/control-plane — cloud control plane

The control plane is the only thing the frontend talks to in Houston Cloud. It authenticates
users, enforces RBAC, spawns/wakes/sleeps each agent's isolated GKE sandbox, holds
provider credentials (keyless proxy), and routes every message to the right sandbox.
See the full plan in [`cloud/README.md`](../../cloud/README.md).

It is **stateless** (state lives in Postgres + the cluster), a self-contained Bun
service (no pnpm membership, like `packages/runtime`), and frontend-agnostic.

## Shape

Every module below is built and tested.

```
src/
  config.ts            env config; `dev` mode swaps live adapters for fakes
  domain/
    types.ts           Org / User / Agent / Grant
    rbac.ts            authorize() — the one pure authz decision (org wall + grant)
  ports.ts             interfaces: RbacStore, TokenVerifier, SandboxManager, CredentialVault
  store/
    memory.ts          in-memory RbacStore (tests + dev)
    pg.ts              Postgres-backed RbacStore (live), matches memory.ts
  auth/
    verify.ts          TokenVerifier (Supabase JWT)
  sandbox/
    fake.ts            FakeSandboxManager (tests + dev)
    gke.ts             GkeSandboxManager (live GKE lifecycle)
    reconcile.ts       apply/scale/delete the K8s objects an agent needs
    manifest.ts        render the agent's Deployment / PVC / Service / etc.
    names.ts           deterministic K8s names from tenancy ids
  proxy/
    route.ts           per-agent routing + 1:1 SSE pass-through
    credentials.ts     keyless credential proxy (swaps in the real key)
  credentials/
    vault.ts           CredentialVault (sandbox-token mint/validate, real keys)
  server.ts            HTTP routes + scope enforcement
  main.ts              boot (dev fakes or live adapters)
```

## Design rules

- **The runtime is never made multi-tenant.** One sandbox = one runtime = one agent.
  Tenancy (identity, authz, routing, creds) lives here, above the runtime.
- **The wall is the sandbox, not the control plane.** `authorize()` controls access; isolation
  is the per-agent GKE sandbox (one volume, default-deny networking).
- **Every outward dependency is a port** with a tested fake and a live adapter.

## Run (dev, all fakes)

```bash
cd packages/control-plane
bun install
CP_DEV=1 bun run dev
```

## Test

```bash
cd packages/control-plane && bun test
```

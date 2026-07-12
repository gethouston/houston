# Houston Agent Store

A Next.js 15 (App Router) **SSR frontend** for the Houston gateway's Agent Store
API. Users browse and one-click install AI agents; creators claim, publish, and
manage the agents they build in Houston.

This app holds **no database and no service credentials**. Every piece of data
comes from the Go gateway at `/v1/agentstore/*`; sign-in is Google Cloud Identity
Platform (Firebase Auth). It deploys as a standalone container on GKE.

## Architecture

```
Browser ──HTML──▶ Next SSR (this app) ──fetch──▶ gateway /v1/agentstore/* (public reads)
   │
   └──bearer (GCIP ID token)──▶ gateway /v1/agentstore/* (authed writes: claim, publish, /me, admin)
```

- **Server components** (`home`, `explore`, `/a/[slug]`, `sitemap`) read the
  public catalog through `src/lib/store-api.ts` using the private
  `AGENTSTORE_GATEWAY_URL`. They never see a user token.
- **Client components** (`/me`, `/claim`, `/admin`, the report dialog) make
  authed/anonymous mutations directly to the gateway through
  `src/lib/store-client.ts` / `store-admin-client.ts`, attaching the signed-in
  user's bearer. They read the browser-inlined
  `NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL`.
- **Sign-in** is confined to `src/lib/auth/` (firebase-js-sdk popup) and surfaced
  by the header `UserMenu`. The `SessionProvider` owns the session and hands out a
  fresh ID token per authed call.
- **Public artifact routes** — `src/app/api/agents/[agent]/{ir,bundle,install-instructions}`
  are the only server routes kept. Each fetches the agent's IR from the gateway
  and builds a machine-readable artifact for receiving assistants (`bundle` also
  records an anonymous install, forwarding the client IP). The Skill-export lib
  (`src/lib/export/`) is unchanged.

Wire contract, DB schema, and admin routes live in the gateway (`cloud/` repo,
`internal/`). The AgentIR 2.0.0 contract is `@houston/agentstore-contract`.

## Local development

```bash
pnpm install                      # from the houston repo root (once)
cp agentstore/.env.example agentstore/.env.local
pnpm --filter houston-agentstore dev   # http://localhost:3300
```

Point `AGENTSTORE_GATEWAY_URL` / `NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL` at a running
gateway (a dev gateway, or `https://gateway.gethouston.ai`). With no gateway
reachable, pages render but catalog reads error — that is expected, not a bug.

Sign-in needs the `NEXT_PUBLIC_FIREBASE_*` values for the same GCIP project the
gateway verifies against. Leave them blank to run with sign-in disabled: the
header shows no account control and `/me`, `/admin`, `/claim` report that sign-in
is unavailable.

### Environment

| Var | Scope | Purpose |
| --- | --- | --- |
| `AGENTSTORE_GATEWAY_URL` | server | Gateway base for SSR public reads. Default `https://gateway.gethouston.ai`. |
| `NEXT_PUBLIC_AGENTSTORE_GATEWAY_URL` | client | Gateway base for browser authed/mutation calls. |
| `NEXT_PUBLIC_SITE_URL` | client | Canonical site URL (OG tags, share/claim links). |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | client | GCIP web API key. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | client | GCIP auth domain (`<project>.firebaseapp.com`). |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | client | GCIP project id. |

The gateway must send CORS for this store's origin on the authed/mutation routes
(and on the anonymous `reports` POST), since those are called from the browser.

## Checks

```bash
pnpm --filter houston-agentstore typecheck
pnpm --filter houston-agentstore test
pnpm --filter houston-agentstore build     # DB-less: never calls the gateway
cd .. && pnpm exec biome check --write agentstore/src
```

## Deploy (GKE)

Build from the **repo root** (the store pulls sibling workspace packages):

```bash
docker build -f agentstore/Dockerfile -t houston-agentstore .
```

The image is a Next standalone server (`node agentstore/server.js`) running as a
non-root `node` user on port 3300. Set the env table above on the Deployment;
`AGENTSTORE_GATEWAY_URL` stays server-side, the `NEXT_PUBLIC_*` values are baked
at build time (pass them as build args / build-time env if they differ per env).

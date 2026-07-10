# houston-agentstore

The Houston Agent Store — a Next.js 15 (App Router, RSC) catalog for publishing
and one-click installing Houston agents. Deploys to Cloudflare Workers via
[OpenNext](https://opennext.js.org/cloudflare).

- **UI**: `@houston/design-tokens` + `@houston-ai/core`, Tailwind v4 (CSS-first).
- **Contract**: `@houston/agentstore-contract` (AgentIR 2.0.0, secret scanning,
  manage tokens).
- **DB**: Supabase Postgres via `drizzle-orm/postgres-js` + the `postgres`
  driver (Workers-compatible; `prepare: false` for the pooler).
- **Mutations**: POST/PATCH route handlers (`runtime = "nodejs"`,
  `force-dynamic`). No server actions.

## Dev loop

```bash
pnpm install                 # from the repo root — installs the workspace
pnpm --filter houston-agentstore dev   # next dev on http://localhost:3300
```

Other scripts:

```bash
pnpm --filter houston-agentstore typecheck   # tsgo --noEmit
pnpm --filter houston-agentstore test        # vitest run
pnpm --filter houston-agentstore build       # next build
pnpm --filter houston-agentstore db:generate # drizzle-kit generate
pnpm --filter houston-agentstore db:migrate  # drizzle-kit migrate
pnpm --filter houston-agentstore db:seed     # seed catalog data
```

## Environment

| Var | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AGENTSTORE_DATABASE_URL` | yes (at query time) | — | Supabase Postgres pooler connection string. |
| `NEXT_PUBLIC_SITE_URL` | no | `https://store.gethouston.ai` | Canonical site URL (OG tags, share/schema links). |

`AGENTSTORE_DATABASE_URL` is read lazily at the first query, so `next build`
runs without it. Local secrets go in `.dev.vars` (Wrangler) or `.env.local`.

## Deploy (Cloudflare Workers)

```bash
pnpm --filter houston-agentstore preview   # opennextjs-cloudflare build + local preview
pnpm --filter houston-agentstore deploy    # build + deploy to the Worker
```

Worker config is in `wrangler.jsonc` (name `houston-agentstore`, `nodejs_compat`).
Set `AGENTSTORE_DATABASE_URL` as a Worker secret before deploying.

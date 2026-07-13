# The dev loop — `pnpm dev`

**There is ONE way to run Houston in development: `pnpm dev`.** Every teammate
gets the same panes, the same env, the same features — including the full
hosted-cloud surface (multiplayer Teams/Spaces, agent moves) with **no
Kubernetes**. The old entry points (`pnpm start`, `pnpm dev:cloud*`,
`scripts/dev-cloud.sh`) are gone; `dev:host` / `dev:app` survive only as
internal pane targets.

Prereqs: node ≥22 + pnpm, Go toolchain, Docker (ONLY for the dev Postgres),
and the sibling `cloud/` checkout next to this repo (`CLOUD_DIR=` overrides).

## What `pnpm dev` runs

`scripts/dev/dev.sh` — reap, doctor, then six panes (`mprocs.yaml`; each
sources `scripts/dev/env.sh`). **One stack per machine, last starter wins**:
the reap step (`scripts/dev/reap.sh`, also `pnpm dev:down`) stops any dev
stack left running — from THIS worktree or any other — via the ownership
marker (`~/.houston-dev/stack.marker`), a signature sweep for orphans, and a
port backstop that only touches recognizably-Houston processes. A foreign
process on one of our ports is left alone and hard-fails the doctor by name.

| Pane | What | Port |
|------|------|------|
| `pg` | Postgres 16 in Docker (data persists in the `houston-dev-pg` volume; container recreated each boot) | 5433 |
| `gateway` | Go gateway from `../cloud` (`go run ./cmd/gateway`) — real GCIP sign-in, boot migrations, `GW_DEV` deliberately unset | 9080 |
| `control-plane` | Go control-plane in **dev-launcher mode** (`CP_DEV_LAUNCHER=1`) — spawns engines as local processes, no kube client | 8081 |
| `host` | The local single-player host (what the desktop app talks to) | 4318 |
| `app` | Desktop app (Tauri) — engine selected by `DEV_DESKTOP_PROFILE` in `.env.local` (one window, one engine; the doctor prints the active profile). **`local`** (default): the host pane — terminal, reveal-in-OS, dictation, local models; login/logout real when `GOOGLE_DESKTOP_CLIENT_ID`+`_SECRET` are set (account-less otherwise — a gate would be uncompletable). **`cloud`**: the local gateway in hosted-oauth mode — the production "Houston Cloud desktop" shape: real sign-in required, **multiplayer in the desktop window**; the local profile is simply not exercised that run | — |
| `web` | Web app — **CLOUD profile**: Google sign-in, multiplayer Teams/Spaces, agent moves, API keys | 1430 |

The two profiles are mutually exclusive by product design (reveal-in-OS vs
Teams), so the loop runs BOTH: the desktop pane for the local surface, the web
pane for the cloud surface. Billing is off (no Stripe) — teams are free
multiplayer orgs. Analytics/Sentry are no-ops in dev by design.

## Env: the two-file model

- **`.env.development`** (committed) — every non-secret knob, identical for the
  whole team. Editing it is a team-wide change: send a PR. Polarity is
  **default-ON, explicit opt-OUT** (the "no dark switches" hard rule in
  CLAUDE.md): plain features have no switch at all, credential-gated features
  turn on by the key's presence (never a boolean on top), and anything
  deliberately off is a committed line here. Dev writes stay local
  (`VITE_AGENTSTORE_GATEWAY_URL` → the dev gateway, never prod). The doctor's
  feature matrix is the contract: every gate is a line, ON or OFF-with-remedy —
  a feature must never silently disappear.
- **`.env.local`** (gitignored) — secrets ONLY (`.env.example` is the
  template): `FIREBASE_API_KEY` (required), `ANTHROPIC_API_KEY` (optional —
  seeded into every fresh engine's `credentials.json` so turns work without
  per-agent connects), `COMPOSIO_API_KEY` (optional — integrations).

The doctor **fails the boot** if `.env.local` re-defines a key
`.env.development` owns, or still carries legacy keys (`VITE_HOSTED_ENGINE_*`,
`VITE_CP_DEV_TOKEN`, `SUPABASE_*`). That is the anti-drift contract: no two
teammates can run different stacks by accident. It ends with a feature matrix
saying exactly what this run enables — a feature that is off says so loudly,
it never silently disappears.

## Engines as processes (the dev-launcher substrate)

The control-plane's dev launcher (`cloud/internal/cpdev`) runs the SAME
`cpserver` handlers production runs; only the Kubernetes substrate is swapped:

| Production object | Dev stand-in |
|-------------------|--------------|
| org namespace | `~/.dev-houston-cloud/<orgSlug>/` |
| agent PVC (`/data`) | `~/.dev-houston-cloud/<orgSlug>/<agentSlug>/` (= `HOUSTON_HOME`) |
| Deployment + pod | one `sh -c` process running THIS checkout's host (`packages/host`) |
| Service DNS name | `http://127.0.0.1:<port>`, port derived from (org, agent) |
| pod Secret token | the same HMAC host token, via `HOUSTON_HOST_TOKEN` |
| fleet informer | the launcher writes registry status rows itself |

Consequences you can rely on: a dead process is an asleep agent (wake = real
0→1 respawn), delete removes the dir like a PVC delete, and an agent **move**
(share → create team) really relocates the data dir between org dirs. Engine
stdout/stderr stream into the **control-plane pane** — the dev stand-in for
`kubectl logs`.

## Testing multiplayer (two users)

1. `pnpm dev`, open http://localhost:1430, sign in with a real Google account.
2. Create an agent in Personal (provisions its engine process in seconds).
3. Share dialog → create a team → the agent moves into it.
4. Invite a second real account; accept from the space switcher in an
   incognito window. Both chat in the shared agent.

Turns need a provider: set `ANTHROPIC_API_KEY` in `.env.local` (seeds every
new engine) or connect one in-app per agent.

## Troubleshooting

- **Port collision on agent create** — two agents can (rarely, ~0.4% at 20
  agents) derive the same loopback port; the provision fails loudly with both
  slugs named. Remedy: delete and re-create the new agent (a fresh slug
  re-rolls the port).
- **Doctor fails on `.env.local`** — it prints exactly which keys to delete
  and why. Do that; don't work around it.
- **Reset the cloud-side world** — stop the loop, `docker volume rm
  houston-dev-pg`, `rm -rf ~/.dev-houston-cloud`. Next boot migrates a fresh
  database. (Desktop-side data lives in `~/.dev-houston`, untouched.)
- **Orphaned engine process holding a port** — the launcher SIGKILLs process
  groups on shutdown; after a hard crash of the control-plane pane, `pkill -f
  'tsx src/local/main.ts'` clears stragglers.
- **`provider_error` on a turn** — that agent's engine has no credential:
  seed via `ANTHROPIC_API_KEY` (new agents only) or connect in-app.
- **Sign-in works but requests 401** — gateway and web must verify against
  the same GCIP project; both come from `.env.development`
  (`GW_AUTH_GCIP_PROJECT` / `FIREBASE_PROJECT_ID`), so an edit there must
  change both together.

## Kubernetes fidelity (pre-release, not everyday)

Pod/PVC/NetworkPolicy/PV-move behavior is NOT exercised by `pnpm dev` — that
is the kind loop's job: `make -C ../cloud kind-up` (see
`cloud/k8s/kind/README.md`). Run it before releases that touch the
gateway↔engine surface. It is being migrated from the legacy TS gateway to
the Go gateway.

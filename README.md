<p align="center">
  <a href="https://gethouston.ai">
    <strong>Houston</strong>
  </a>
</p>

<p align="center">
  <strong>The open source platform for AI-native products.</strong><br>
  One desktop app. Pre-built AI agents that work from day one.<br>
  Real tools. 1000+ integrations. Free forever.
</p>

<p align="center">
  <a href="https://gethouston.ai">gethouston.ai</a> ·
  <a href="https://gethouston.ai/vision/">Vision</a> ·
  <a href="https://gethouston.ai/learn/">Learn</a> ·
  <a href="https://gethouston.ai/startups/">For Startups</a> ·
  <a href="https://forms.gle/ac24qrKSufYvfudt8">Join the waiting list</a>
</p>

<p align="center">
  <a href="https://github.com/gethouston/houston/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0d0d0d" alt="MIT License"></a>
  <a href="https://github.com/gethouston/houston/stargazers"><img src="https://img.shields.io/github/stars/gethouston/houston?color=0d0d0d" alt="Stars"></a>
</p>

---

Houston uses a single TypeScript engine. See `convergence/README.md`.

## What Houston is

**For everyone** — a free desktop app with AI agents that do real work. Bookkeeping, outreach, research, scheduling. Create or import agents and start working. No terminal. No prompt engineering.

**For founders** — the platform where you build AI-native products for your customers. Define your agents, Houston handles the workspace, the chat, the board, the integrations. You bring the domain expertise. [Read more](https://gethouston.ai/startups/).

> **Read the vision:** [Ship the impossible](https://gethouston.ai/vision/)

---

## Quick start

### Run the Houston app

**Prerequisites:** [Node 22+](https://nodejs.org), [pnpm 10](https://pnpm.io) (`corepack enable`), the [Rust toolchain](https://rustup.rs) (Tauri builds the desktop shell), [Go](https://go.dev) and Docker Desktop (the local cloud stack: gateway, control-plane, Postgres), and the sibling [`gethouston/cloud`](https://github.com/gethouston/cloud) checkout cloned next to this repo. Bun is only needed when compiling the host sidecar binary (`scripts/build-host-sidecar.sh`). Don't audit this list by hand — `pnpm dev` runs a doctor that checks every prerequisite and prints the exact fix for anything missing.

**1. Clone and install.** pnpm owns the whole JS/TS workspace: app, web, UI packages, host, runtime, and supporting packages.

```bash
git clone https://github.com/gethouston/houston.git
git clone https://github.com/gethouston/cloud.git      # sibling checkout
cd houston

pnpm install
```

**2. Configure once.** Non-secret dev config is committed in `.env.development` — you never touch it. Secrets go in `.env.local`:

```bash
cp .env.example .env.local     # then set FIREBASE_API_KEY (ask a teammate)
```

**3. Run.** One command, the whole product:

```bash
pnpm dev
```

The doctor validates your setup (and prints the feature matrix for this run), then mprocs starts every pane: Postgres, the Go gateway (`:9080`), the control-plane (engines spawn as local processes — no Kubernetes), the local host (`:4318`), the **desktop app** (local profile: terminal, files, local models, no sign-in), and the **web app** (`http://localhost:1430`, cloud profile: real Google sign-in, multiplayer Teams/Spaces).

To test multiplayer, sign into the web app as user A, then open an incognito window and sign in as user B — share an agent into a team, invite, accept, chat. On first launch, connect an AI provider (or set `ANTHROPIC_API_KEY` in `.env.local` to seed every dev engine). Local-profile workspaces live in `~/.houston/workspaces`; dev cloud engines under `~/.dev-houston-cloud`.

#### Configure providers

Connect model providers from the AI Models screen inside the app. Anthropic and OpenAI use in-app OAuth flows. API-key providers such as OpenRouter, Google Gemini, and Amazon Bedrock accept keys in the same UI. Model providers are not configured through environment variables.

#### Connected apps (integrations)

Connected apps (Gmail, Slack, and about 1000 more) run in platform mode through [Composio](https://composio.dev). The packaged desktop app forwards these calls through Houston's cloud with your signed-in session, so it holds no provider key. To run integrations fully locally instead, create your own free Composio project and launch the app (or the host, in the dev loop) with `COMPOSIO_API_KEY` set in the environment: the host then talks to Composio directly and no integration call touches Houston's cloud. Leave both unset to run with integrations off. See `.env.example` for the dev wiring.

> Committed `.env.development` + secrets-only `.env.local` is the whole env story — the doctor refuses to boot if `.env.local` re-defines a committed key, so no two teammates can run different stacks. See [`convergence/README.md`](convergence/README.md) for hot reload and watch mode.

### Test like production (Kubernetes)

`pnpm dev` already runs the full product, including multiplayer, with engines as local processes. When you need to verify the **Kubernetes-shaped** parts before a release — per-agent pods and PVCs, namespaces, NetworkPolicy, PV-rebind agent moves — run the [kind](https://kind.sigs.k8s.io/) loop from the sibling cloud repo:

```bash
make -C ../cloud kind-up      # cluster + gateway + engine pods; see cloud/k8s/kind/README.md
```

Billing is off unless `GW_STRIPE_*` test keys are set (teams run as free multiplayer orgs); see `cloud/docs/deploy-C8.md` §Stage 2.

### Build your first agent

Create two files:

**houston.json**
```json
{
  "id": "bookkeeper",
  "name": "Bookkeeper",
  "description": "Categorize expenses and reconcile accounts.",
  "icon": "Calculator",
  "category": "business"
}
```

**CLAUDE.md**
```markdown
# Bookkeeper

You categorize transactions, reconcile accounts, and flag anomalies.
Ask which period the user wants before starting.
```

Push to GitHub. In Houston, click **New Agent > GitHub**, paste your repo URL. Done.

The [Learn guide](https://gethouston.ai/learn/) covers the full details in five short chapters.

### Share a workspace template

Bundle multiple agents into one repo:

```
my-workspace/
├── workspace.json
└── agents/
    ├── bookkeeper/
    │   ├── houston.json
    │   └── CLAUDE.md
    └── tax-reviewer/
        ├── houston.json
        └── CLAUDE.md
```

**workspace.json**
```json
{
  "name": "Tax Practice",
  "description": "A complete workspace for tax professionals.",
  "agents": ["bookkeeper", "tax-reviewer"]
}
```

In Houston, click **New Workspace > Import from GitHub**, paste the repo URL. Houston creates the workspace with all agents ready to use.

---

## How the app works

Houston organizes work into **Workspaces** and **Agents**:

- **Workspace** — a group of agents (like a team or project).
- **Agent** — an AI agent instance. Chat, kanban board, skills, files, integrations.
- **Agent Definition** — a `houston.json` that defines what an agent looks like and does.

```
Workspace ("Tax Practice")
  ├── Agent ("Bookkeeper")         ← board, files, instructions
  ├── Agent ("Document Reviewer")  ← board, files, integrations
  └── Agent ("Client Comms")       ← board, files, integrations
```

Each kanban card is a Claude conversation. Click a card to see the full chat. Connect Slack and the same conversation becomes a thread.

---

## Agent definitions

Two tiers:

| Tier | What you write | What you get |
|------|---------------|-------------|
| **JSON-only** | `houston.json` + `CLAUDE.md` | A new agent. Renders the standard shell (Activity, Routines, Files, Job Description, Integrations). |
| **Workspace template** | `workspace.json` + agents folder | Multiple agents, one import. |

Every agent shows the same five tabs. The list lives in `app/src/agents/standard-tabs.ts` if you want to read it in code.

---

## Run With Docker

Use `selfhost/` to run Houston behind HTTPS on a VPS. Docker builds one
Node-based host image that spawns the pi runtime in-container, plus Caddy for TLS.
The web UI is a static build served by Caddy from `selfhost/web`.

```bash
git clone https://github.com/gethouston/houston
cd houston
pnpm install
VITE_NEW_ENGINE=1 pnpm --filter houston-web build
mkdir -p selfhost/web && cp -R packages/web/dist/. selfhost/web/
cd selfhost
cp .env.example .env          # set HOUSTON_DOMAIN and HOUSTON_HOST_TOKEN
docker compose up -d --build
docker compose logs -f
```

See the [full self-host guide](selfhost/README.md), or deploy to
[Railway](selfhost/deploy-railway.md) or a
[Hostinger VPS](selfhost/deploy-hostinger.md). The lower-level runtime image
lives at `packages/runtime/Dockerfile`; it is not the full app.

---

## Monorepo layout

Organized around the desktop app, the browser app, the converged TypeScript
engine, and the supporting product surfaces.

```
houston/
├── app/                     Houston App — desktop (Tauri 2)
│   ├── src/                 React frontend (also runs as packages/web)
│   └── src-tauri/           Tauri shell (spawns the host sidecar; OS-native glue)
├── website/                 Houston Website — gethouston.ai
├── teams/                   Houston Teams (TBD — hosted multi-tenant)
├── packages/               THE CONVERGENCE — the single TypeScript engine (see convergence/README.md)
│   ├── runtime/             pi runtime — the only agent loop
│   ├── host/                the host (cloud + local desktop, adapter profiles) — OPEN
│   ├── domain/              shared domain logic (.houston layout, schemas, cron, portable)
│   ├── protocol/            v3 wire types + zod
│   ├── web/                 the full desktop UI in a browser tab
│   └── code-sandbox/        egress-locked code-execution sandbox (cloud)
├── BOUNDARY.md             Everything here is OPEN; cloud-lib-free, enforced by scripts/check-boundaries.mjs
├── selfhost/               Self-host the TS engine on a VPS (Docker + Caddy TLS)
├── convergence/            The single-engine convergence plan + status (SOURCE OF TRUTH)
│
└── ui/                      Houston UI — @houston-ai/* React packages
```

> The legacy Rust engine and its Tauri adapter were removed during convergence.
> `packages/` now contains the only engine, which the `app/src-tauri` shell
> launches as a sidecar.

> `packages/control-plane` was renamed to `packages/host`. The host still owns
> the cloud-control-plane role, but the package and path are now host-first.

See `knowledge-base/architecture.md` for repo-shape detail + current gaps.

---

## Build on Houston Host (custom frontends)

The host is frontend-agnostic. You don't have to ship inside the Houston App,
any web or native runtime can drive it over protocol v3 HTTP + SSE using
[`@houston-ai/engine-client`](ui/engine-client/).

The canonical non-Tauri consumer is `packages/web`, the full desktop UI in a
browser tab over the host's protocol v3.

---

## Resources

- **[gethouston.ai](https://gethouston.ai)** — landing page
- **[For Startups](https://gethouston.ai/startups/)** — build AI-native products on Houston
- **[Vision essay](https://gethouston.ai/vision/)** — Ship the impossible
- **[Learn guide](https://gethouston.ai/learn/)** — five chapters on building agents
- **[Join the waiting list](https://forms.gle/ac24qrKSufYvfudt8)** — get notified when the app ships

---

## Contributing

Houston is open source under MIT. Issues and PRs welcome.

---

## License

MIT

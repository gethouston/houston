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

**Prerequisites:** [Node 22+](https://nodejs.org), [pnpm 10](https://pnpm.io) (`corepack enable`), and — for the desktop app only — the [Rust toolchain](https://rustup.rs) (Tauri builds a native shell). The browser path needs no Rust. Bun is only needed when compiling the host sidecar binary (`scripts/build-host-sidecar.sh`).

**1. Clone and install.** pnpm owns the whole JS/TS workspace: app, web, UI packages, host, runtime, and supporting packages.

```bash
git clone https://github.com/gethouston/houston.git
cd houston

pnpm install
```

**2. Configure once.** Copy the shared dev env. The defaults work as-is (host on `127.0.0.1:4318`, dev token `devtoken`):

```bash
cp .env.example .env.local
```

**3. Run.** One terminal for the host, one for a frontend:

```bash
# Terminal 1 — the TypeScript engine (host on :4318; it auto-spawns the agent runtime)
cd packages/host && pnpm dev

# Terminal 2 — the desktop app (Tauri), wired to that engine
cd app && pnpm start
```

Prefer a browser tab? Use this instead of Terminal 2:

```bash
cd packages/web && pnpm dev:host            # http://localhost:1430
```

On first launch, connect an AI provider. Your workspaces live in `~/.houston/workspaces`.

#### Configure providers

Connect model providers from the AI Models screen inside the app. Anthropic and OpenAI use in-app OAuth flows. API-key providers such as OpenRouter, Google Gemini, and Amazon Bedrock accept keys in the same UI. Model providers are not configured through environment variables.

#### Connected apps (integrations)

Connected apps (Gmail, Slack, and about 1000 more) run in platform mode through [Composio](https://composio.dev). The packaged desktop app forwards these calls through Houston's cloud with your signed-in session, so it holds no provider key. Two ways to run integrations fully locally instead, with no call touching Houston's cloud:

- **Your own Composio key** — create a free Composio project and launch the app (or the host, in the dev loop) with `COMPOSIO_API_KEY` set: the host talks to Composio's REST API directly.
- **A remote MCP server with OAuth** — set `HOUSTON_MCP_INTEGRATIONS` to a Streamable-HTTP MCP endpoint that authorizes with MCP OAuth 2.1, such as Composio's hosted endpoint (`https://connect.composio.dev/mcp`). No API key at all: connecting the app opens a browser sign-in, and the server's tools appear to your agents alongside everything else.

Leave all of it unset to run with integrations off. See `.env.example` for the dev wiring.

> The shared `.env.local` holds the host token plus each frontend's host URL and token, so the commands above need no flags. See [`convergence/README.md`](convergence/README.md) for the full local dev loop, including hot reload and watch mode.

### Test like the cloud

The loop above runs the **local** engine. To test the managed hosted product — Teams / C8 Spaces, per-agent engine pods, invites, agent moves — exactly as it runs in production, use one command:

```bash
pnpm dev:cloud
```

It stands up a [kind](https://kind.sigs.k8s.io/) cluster with the private gateway (built from the sibling `cloud/` checkout) and one engine pod per agent (built from **this** checkout), then runs the web app at `http://localhost:1430` signed in via a real Firebase / GCP Identity Platform ID token — the same JWT the gateway verifies. Requires Docker Desktop, `kind`, `kubectl`, `jq`, and `FIREBASE_API_KEY`/`FIREBASE_AUTH_DOMAIN`/`FIREBASE_PROJECT_ID` in `.env.local` (same project the gateway checks). On success it prints the full C8 test walkthrough (sign in as two users, share an agent into a team, invite + accept, chat, mission board, org dashboard).

```bash
pnpm dev:cloud --check     # preflight only — checks tooling/env, prints the plan
pnpm dev:cloud:app         # same stack, but launch the DESKTOP app (tauri dev) instead of the web tab
pnpm dev:cloud:retain      # flip agent PVs to Retain (run before an agent move)
pnpm dev:cloud:down        # tear the cluster down and stop the web server
```

`dev:cloud:app` points the Tauri shell at the local gateway (`VITE_HOSTED_ENGINE_URL`), which flips it to hosted Google-login mode — the true desktop experience. The web frontend is the same `app/src` codebase in a browser tab, so for multiplayer testing run the desktop app as user A and an incognito web tab (`pnpm dev:cloud`) as user B.

Billing is off unless `GW_STRIPE_*` test keys are set (teams run as free multiplayer orgs); see `cloud/docs/deploy-C8.md` §Stage 2. The gateway loop itself lives in `cloud/k8s/kind/README.md`.

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

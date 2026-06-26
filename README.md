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

Houston is converging onto a single TypeScript engine — see `convergence/README.md`.

## What Houston is

**For everyone** — a free desktop app with AI agents that do real work. Bookkeeping, outreach, research, scheduling. Install agents from the store and start working. No terminal. No prompt engineering.

**For founders** — the platform where you build AI-native products for your customers. Define your agents, Houston handles the workspace, the chat, the board, the integrations. You bring the domain expertise. [Read more](https://gethouston.ai/startups/).

> **Read the vision:** [Ship the impossible](https://gethouston.ai/vision/)

---

## Quick start

### Run the Houston app

**Prerequisites:** [Node 22+](https://nodejs.org), [pnpm 10](https://pnpm.io) (`corepack enable`), [Bun](https://bun.sh) (the engine and runtime are Bun services), and — for the desktop app only — the [Rust toolchain](https://rustup.rs) (Tauri builds a native shell). The browser path needs no Rust.

**1. Clone and install.** The frontend is a pnpm workspace; the engine and runtime are standalone Bun projects (not pnpm members), so they install on their own:

```bash
git clone https://github.com/gethouston/houston-web.git
cd houston-web

pnpm install                                # frontend: app, packages/web, ui/*, domain, protocol
(cd packages/runtime && bun install)        # the agent runtime (the pi loop)
(cd packages/control-plane && bun install)  # the host (the TypeScript engine)
```

**2. Configure once.** Copy the shared dev env. The defaults work as-is (host on `127.0.0.1:4318`, dev token `devtoken`):

```bash
cp .env.example .env.local
```

**3. Run.** One terminal for the engine, one for a frontend:

```bash
# Terminal 1 — the TypeScript engine (host on :4318; it auto-spawns the agent runtime)
cd packages/control-plane && pnpm dev

# Terminal 2 — the desktop app (Tauri), wired to that engine
cd app && pnpm start
```

Prefer a browser tab? Use this instead of Terminal 2:

```bash
cd packages/web && pnpm dev:host            # http://localhost:1430
```

On first launch, sign in with Claude (the **Reconnect your AI** card). Your workspaces live in `~/.houston/workspaces`.

> The shared `.env.local` holds the host token plus each frontend's engine URL and token, so the commands above need no flags. See [`convergence/README.md`](convergence/README.md) for the full local dev loop (hot reload, watch mode, the `dev:cloud` profile).

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
Bun-based host image that spawns the pi runtime in-container, plus Caddy for TLS.
The web UI is a static build served by Caddy from `selfhost/web`.

```bash
git clone https://github.com/gethouston/houston-web
cd houston-web
pnpm install
VITE_NEW_ENGINE=1 pnpm --filter houston-web build
mkdir -p selfhost/web && cp -R packages/web/dist/. selfhost/web/
cd selfhost
cp .env.example .env          # set HOUSTON_DOMAIN and HOUSTON_HOST_TOKEN
docker compose up -d --build
docker compose logs -f
```

Full guide, including desktop and web clients for local or remote Docker engines:
[`selfhost/README.md`](selfhost/README.md). The lower-level runtime image lives
at `packages/runtime/Dockerfile`; it is not the full app.

---

## Monorepo layout

Organized as **5 end-user products + the code libraries**.

```
houston/
├── app/                     Houston App — desktop (Tauri 2)
│   ├── src/                 React frontend (also runs as packages/web)
│   ├── src-tauri/           Tauri binary (spawns the engine sidecar)
│   └── houston-tauri/       Tauri adapter (applies the legacy Rust engine to desktop)
├── store/                   Houston Store — agent registry (UI cut in the convergence)
├── website/                 Houston Website — gethouston.ai
├── teams/                   Houston Teams (TBD — hosted multi-tenant)
│
├── packages/               THE CONVERGENCE — the single TypeScript engine (see convergence/README.md)
│   ├── runtime/             pi runtime — the only agent loop
│   ├── host/                the host (cloud + local desktop, adapter profiles) — OPEN
│   ├── host-cloud/          CLOSED cloud adapters (Pg/Gcs/Gke/Redis + admin + cloud main)
│   ├── domain/              shared domain logic (.houston layout, schemas, cron, portable)
│   ├── protocol/            v3 wire types + zod
│   ├── web/                 the full desktop UI in a browser tab
│   └── code-sandbox/        egress-locked code-execution sandbox (cloud)
├── BOUNDARY.md             The open/closed seam (enforced by scripts/check-boundaries.mjs)
├── selfhost/               Self-host the TS engine on a VPS (Docker + Caddy TLS)
├── convergence/            The single-engine convergence plan + status (SOURCE OF TRUTH)
│
├── ui/                      Houston UI — @houston-ai/* React packages
├── engine/                  LEGACY Rust engine — current default build, deleted at the final cutover
└── cloud/                   Houston Cloud — deploy + admin for the hosted multi-tenant host
```

> Removed in the convergence: `mobile/` + `houston-relay/` (mobile PWA + tunnel),
> `examples/smartbooks/` (custom-frontend reference), `always-on/` (the legacy
> Rust-engine VPS image — the TS-engine self-host is `selfhost/`).

See `knowledge-base/architecture.md` for crate-level detail + current gaps.

---

## Build on Houston Engine (custom frontends)

The engine is frontend-agnostic. You don't have to ship inside the
Houston App — any web or native runtime can drive it over HTTP +
WebSocket using [`@houston-ai/engine-client`](ui/engine-client/).

> The standalone `examples/smartbooks/` custom-frontend reference was
> REMOVED in the convergence sweep. The frontend-agnostic contract still
> holds; the canonical non-Tauri consumer is now `packages/web` (the full
> desktop UI in a plain browser tab over the host's protocol v3).

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

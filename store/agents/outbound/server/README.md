# Outbound A2A Server

A local HTTP server that makes a Houston agent reachable from the [Bio marketplace](https://bioanywhere.com) via the A2A (Agent-to-Agent) protocol. External agents and API callers POST a message to a public URL; the request tunnels to your machine, runs through a full Claude agent loop with access to local tools, and returns the result.

---

## Architecture

```
Bio marketplace / external caller
        |
        | HTTPS POST (A2A JSON-RPC)
        v
Vercel (outbound-agent-iota.vercel.app/api)
        |
        | HTTP forward  [reads LOCAL_AGENT_URL env var]
        v
Cloudflare Tunnel  (*.trycloudflare.com)
        |
        | HTTP  localhost:3001
        v
Express server  (this folder, index.js)
        |
        | Reads CLAUDE.md, runs agent loop
        v
Anthropic API  (claude-haiku-4-5)
        |
        | tool_use -> bash / read_file / write_file
        v
Local tools: Composio CLI, workspace files
```

Every inbound A2A request travels the full chain. The agent runs on your machine with access to all locally configured integrations (Composio, Airtable, Apollo, Instantly, Apify).

---

## Why this design

### Problem
Houston agents run locally. The Bio marketplace needs a public HTTPS endpoint to route tasks. Serverless platforms (Vercel, AWS Lambda) timeout at 5 minutes — too short for a 30–60 minute LinkedIn outreach pipeline.

### Solution chosen: local tunnel
- **Local server** keeps the agent process alive for as long as needed.
- **Cloudflare Tunnel** (`cloudflared`) creates a public HTTPS URL that proxies to `localhost:3001` — no account required, no firewall changes.
- **Vercel** acts as a stable public endpoint. Its only job is to read `LOCAL_AGENT_URL` from an environment variable and forward the request. When the tunnel URL changes (each restart), a script updates that env var and redeploys Vercel (~10 seconds).
- **Bio marketplace** has one permanent URL (`outbound-agent-iota.vercel.app/api`) registered in its agent card. It never needs to know the tunnel URL directly.

### Alternatives considered
| Option | Rejected because |
|---|---|
| Vercel serverless function running Claude directly | 300s max timeout; pipeline takes 30–60 min |
| Persistent cloud server (Railway, Fly.io) | Needs Composio credentials and integrations re-configured server-side |
| ngrok | Requires account for stable URLs; paid for reserved domains |
| Cloudflare named tunnel | Requires Cloudflare account; quick tunnels are account-free |

---

## File structure

```
server/
  index.js          — Express A2A server + Claude agent loop
  update-tunnel.js  — Updates Vercel env var and redeploys after tunnel URL changes
  launch.ps1        — One-click PowerShell launcher (server + tunnel + Vercel update)
  start.bat         — Calls launch.ps1 (double-click entry point for Windows)
  package.json      — Dependencies: express, @anthropic-ai/sdk
  node_modules/     — Installed by npm install
  README.md         — This file

deploy/
  api/
    index.js        — Vercel serverless function: forwards A2A requests to LOCAL_AGENT_URL
  .well-known/
    agent-card.json — A2A-spec agent card served at /.well-known/agent-card.json
  index.html        — Human-readable landing page
  vercel.json       — Vercel project config (CORS headers, project name)
```

---

## Prerequisites

| Requirement | How to install |
|---|---|
| Node.js 20+ | Already installed |
| Vercel CLI | Already installed (`vercel whoami` = agarcia-9545) |
| cloudflared | `winget install Cloudflare.cloudflared` (already installed at `C:\Program Files (x86)\cloudflared\`) |
| Anthropic session token | Read automatically from `C:\Users\agarc\.claude\.credentials.json` |

---

## How to run

Double-click `start.bat`. It calls `launch.ps1` which:

1. Kills any process already on port 3001.
2. Kills any existing `cloudflared` process.
3. Runs `npm install` (skips if already up to date).
4. Starts `node index.js` with `ANTHROPIC_API_KEY` set from your Claude session token.
5. Starts `cloudflared tunnel --url http://localhost:3001` and waits for the `trycloudflare.com` URL to appear in the log.
6. Runs `node update-tunnel.js <url>` which removes the old `LOCAL_AGENT_URL` env var from Vercel, adds the new one, and runs `vercel deploy --prod`.
7. Prints the live endpoint summary and waits. Press Enter to stop both processes cleanly.

Expected output:
```
== Outbound A2A Launcher ==
Cleared port 3001
Checking dependencies...
Starting A2A server...
Server running (PID 23456): {"name":"Outbound","version":"0.1.2","status":"ok"}
Starting Cloudflare tunnel...
  Waiting for tunnel... 2s
Tunnel: https://xxxx-xxxx.trycloudflare.com
Updating Vercel...
Done. Vercel forwarder is live at: https://outbound-agent-iota.vercel.app
========================================
 Outbound agent is LIVE
 Local : http://localhost:3001
 Tunnel: https://xxxx-xxxx.trycloudflare.com
 Bio   : https://outbound-agent-iota.vercel.app/api
========================================
Press Enter to stop the agent
```

---

## A2A protocol

The server implements [A2A protocol v0.3](https://bioanywhere.com) over JSON-RPC 2.0.

### Agent card
Served at `/.well-known/agent-card.json`. Bio reads this to discover the agent's skills, capabilities, and endpoint URL. The `url` field points to `/api` — the A2A endpoint.

### message/send
The only method the server handles. Request shape:

```json
{
  "jsonrpc": "2.0",
  "id": "any-string",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "contextId": "optional",
      "parts": [
        { "kind": "text", "text": "Run the LinkedIn pipeline on https://linkedin.com/posts/..." }
      ]
    }
  }
}
```

Response shape (on success):

```json
{
  "jsonrpc": "2.0",
  "id": "any-string",
  "result": {
    "id": "task-<timestamp>",
    "contextId": "ctx-<timestamp>",
    "kind": "task",
    "status": {
      "state": "completed",
      "message": {
        "role": "agent",
        "parts": [{ "kind": "text", "text": "Pipeline complete. Campaign created in Instantly..." }]
      }
    }
  }
}
```

---

## Agent loop (index.js)

The server runs a full agentic loop — not just a single Claude call. This means Claude can call tools, see the results, decide what to do next, and loop until the task is done.

### System prompt
On each request, the server reads `../CLAUDE.md` (the parent workspace's agent instructions) and appends an A2A-mode note: run autonomously, draft emails without interactive approval, return a summary when done.

### Tools exposed to Claude

| Tool | What it does |
|---|---|
| `bash` | Runs any shell command in the workspace directory. Used for `composio execute`, `composio search`, file reads via `cat`, etc. |
| `read_file` | Reads a file at a given path (absolute or relative to workspace). |
| `write_file` | Writes content to a file, creating parent directories as needed. |

These three tools give Claude everything it needs to follow the skill procedures in `.agents/skills/*/SKILL.md` files — the same procedures it follows interactively in Houston.

### Loop limit
The loop runs for up to 50 iterations. Each iteration = one Claude API call + zero or more tool executions. A full LinkedIn pipeline typically takes 20–35 iterations.

### Authentication
The server checks whether `ANTHROPIC_API_KEY` starts with `sk-ant-oat` (OAuth session token) or `sk-ant-api` (API key).

- **OAuth token**: uses raw `fetch` to `api.anthropic.com` with `Authorization: Bearer <token>`. The Anthropic SDK does not handle OAuth tokens cleanly in v0.39, so the SDK is bypassed for this path.
- **API key**: uses the Anthropic SDK normally (`new Anthropic({ apiKey })`).

The token is read from `C:\Users\agarc\.claude\.credentials.json` at launch time by `launch.ps1`. It expires in ~1 year (June 2027). When it expires, rerun `launch.ps1` — it reads the file fresh each time.

> **Rate limits**: The Claude.ai OAuth token has tighter rate limits than a dedicated API key. For high-volume use, replace the token with an API key from [console.anthropic.com](https://console.anthropic.com). Update `ANTHROPIC_API_KEY` in `launch.ps1`.

---

## Vercel forwarder (deploy/api/index.js)

A minimal Vercel serverless function. Its only job:

1. Read `process.env.LOCAL_AGENT_URL` (the current Cloudflare tunnel URL).
2. Forward the POST body to that URL verbatim.
3. Return whatever the local server responds.

If `LOCAL_AGENT_URL` is missing or set to `placeholder`, it returns a 503 with a clear message rather than hanging.

The forward timeout is 290 seconds — just under Vercel's 300s hard limit. For long pipelines, the local server returns the full result synchronously; Vercel just proxies it.

---

## update-tunnel.js

Run by `launch.ps1` after the tunnel URL is captured. Does three things:

1. `vercel env rm LOCAL_AGENT_URL production --yes` — removes the old value.
2. `echo <url> | vercel env add LOCAL_AGENT_URL production` — adds the new one.
3. `vercel deploy --yes --prod` — redeploys so the Vercel function picks up the new env var.

Redeployment takes ~10 seconds. After that, all traffic from Bio reaches the new tunnel.

---

## Bio marketplace registration

The agent is registered on Bio with ID `f60cb7ff-eca2-4736-8db3-ee4a044d4441`.

```
Name:     Outbound
Endpoint: https://outbound-agent-iota.vercel.app/api
Skills:   8 (linkedin-comment-to-outreach, linkedin-reaction-to-outreach, ...)
Health:   ok (Bio probes /.well-known/agent-card.json + POST to /api)
Provider: G-Forward
Version:  0.1.2
```

Bio API key for this agent (owner operations): `ba_13e2772a4c44df94eabdc42c730c2849dab9e6fe5d29784c`  
Bio user API key (marketplace search/admin): stored in `C:\Users\agarc\.houston\mcp.json`

---

## Adapting for another agent

The server and deploy folders are reusable. To add a second agent:

1. **Copy** `server/` and `deploy/` into the other agent's workspace root.
2. **Deploy a new Vercel project**: `cd deploy && vercel deploy --yes --prod` — Vercel will prompt for a new project name (e.g. `my-agent`). Note the new URL.
3. **Update `update-tunnel.js`**: change the `vercel deploy` line's working directory or project link to point to the new project.
4. **Update `deploy/.well-known/agent-card.json`**: change `name`, `description`, `url` (to the new Vercel URL + `/api`), and `skills`.
5. **Register on Bio**: run `registerAgent` via the Bio MCP with the new agent card. Save the returned API key.
6. **Run `start.bat`** from the new workspace — it reads that workspace's `CLAUDE.md` automatically via `$PSScriptRoot`.

The Anthropic token, cloudflared, and Vercel CLI are shared — no changes needed.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE: port 3001` | Previous server still running | `launch.ps1` kills it automatically; if it persists: `netstat -ano \| findstr :3001` then `taskkill /PID <n> /F` |
| Tunnel times out (no URL after 30s) | cloudflared can't reach Cloudflare | Check internet connection; try running `cloudflared tunnel --url http://localhost:3001` in a terminal manually |
| `429 rate_limit_error` | OAuth token rate limit hit | Wait 30s and retry; or use a proper API key from console.anthropic.com |
| `503` from Vercel | `LOCAL_AGENT_URL` is placeholder | Run `start.bat` — the Vercel env var only updates when the launcher runs |
| `502 Bad Gateway` from tunnel | Local server crashed | Check the "Outbound A2A Server" terminal window for errors; re-run `start.bat` |
| Bio health shows `unreachable` | Agent card URL not reachable | Confirm the server is running and the tunnel is active; Bio re-checks health periodically |

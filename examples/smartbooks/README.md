# SmartBooks — custom frontend on houston-engine

> _Note: runs against the legacy Rust `houston-engine` today. Post-P6 the engine command becomes the TS host (`packages/control-plane`); the HTTP+WS/SSE contract is compatible. See `convergence/README.md`._

A reference consumer of the Houston Engine that looks nothing like the
Houston App. Same backend, different brand. Drop a bank-statement PDF,
get a categorized transaction table back plus a downloadable multi-sheet
Excel workpaper. Ask for a new column, your bookkeeper edits the Python
script that generates it — every future statement picks up the change.

**What this example proves:** the engine is frontend-agnostic. Any
React/Vue/Svelte/native app can talk to `houston-engine` over HTTP+WS
using `@houston-ai/engine-client`. No Tauri, no Houston App look, no
coupling to the desktop shell.

---

## Mental model

A traditional app for 90% of the work. An AI engineer for the other
10%.

- The **transactions table** and the **Excel workpaper** are both
  produced by plain Python scripts the agent ships with. Deterministic,
  fast, cheap — zero LLM calls per invocation.
- When a user hits an edge case ("add a Tax column", "Acme's AWS
  charges are always Cloud, remember that"), the agent **edits the
  script** or writes a per-client `rules.md`. The change is permanent.
  Next run uses the new deterministic path.
- The app gets smarter over time without shipping releases.

The AI is the compiler, not the runtime.

---

## Stack

- Vite + React 19 — hand-rolled CSS, zero `@houston-ai/*` UI packages
- `@houston-ai/engine-client` — the only Houston dependency
- Python scripts seeded into the agent on first run (extraction +
  workpaper generation via `openpyxl`)

Footprint: ~1000 lines of TSX + ~600 lines of CSS + ~200 lines of
Python seeds. One npm dep.

---

## Run it

Two processes: the engine (backend) and this Vite dev server
(frontend).

### 1. Start the engine

From the repo root:

```bash
# Build once if needed.
cargo build --release -p houston-engine-server --bin houston-engine

# Pick any token + port. Use a scratch home dir so you don't mix with
# real Houston App data.
HOUSTON_HOME=/tmp/smartbooks-home \
HOUSTON_DOCS=/tmp/smartbooks-docs \
HOUSTON_BIND=127.0.0.1:7777 \
HOUSTON_ENGINE_TOKEN=dev-token \
HOUSTON_NO_PARENT_WATCHDOG=1 \
  ./target/release/houston-engine
```

First line of stdout:

```
HOUSTON_ENGINE_LISTENING port=7777 token=dev-token
```

Confirm it's alive:

```bash
curl -H 'Authorization: Bearer dev-token' http://127.0.0.1:7777/v1/health
# {"status":"ok","version":"0.4.0","protocol":1}
```

You need the `claude` CLI on `PATH` and authenticated (`claude login`)
for sessions to run. `which claude` should resolve. Codex works too.

### 2. Start SmartBooks

```bash
cd examples/smartbooks
pnpm install
pnpm dev
# → http://localhost:5177
```

Opens straight into the app — no login, no paste-this-token dance. The
frontend auto-resolves the engine config from (in priority order):

1. `localStorage["smartbooks.engine"]` — user override from the
   Connect screen (only shown on connection failure)
2. Vite build-time env: `VITE_HOUSTON_ENGINE_BASE` +
   `VITE_HOUSTON_ENGINE_TOKEN` (see `.env.example`) — the path a
   production custom frontend would use
3. Hardcoded demo default: `http://127.0.0.1:7777` + `dev-token`,
   matching the engine command above

On first launch it:

1. Calls `/v1/health` to confirm the engine is reachable
2. Finds or creates a workspace named **SmartBooks**
3. Finds or creates an agent named **Bookkeeper**, seeding it with a
   bookkeeper persona `CLAUDE.md` + two Python scripts
4. Calls `/v1/watcher/start` so filesystem changes emit WS events —
   **this is the load-bearing call custom frontends must make; without
   it agent-side writes don't update the UI**
5. Caches everything in `localStorage`

If the engine is down you'll see a Connect screen to pick a different
URL + token. That's the only time it appears.

---

## What you'll see

### Empty state

"Welcome to SmartBooks" → click **+ Add your first client**. Pick a
name ("John Doe"). The frontend calls `createFolder` + `writeAgentFile`
on the engine to lay down:

```
clients/john-doe/
  client.json       { id, name, slug, createdAt }
  statements/       (empty — for uploads)
```

### Main view (three panes)

- **Left sidebar** — client list
- **Main pane** — the selected client's workspace
- **Right rail** — collapsed "Customize" strip (wrench icon + ⌘K chip)

The main pane has a big drop canvas. Drop a bank-statement PDF → the
upload hits `importFileBytes` → `statements/20260421T…-statement.pdf`
lands on disk → the frontend auto-fires a session with a structured
prompt like:

```
(client: John Doe, folder: clients/john-doe/)
Process clients/john-doe/statements/<file>. Write the full table to
clients/john-doe/workbook.csv AND regenerate the Excel workpaper at
clients/john-doe/workpaper.xlsx. Every row must include
source: "<filename>". Reply in one sentence.
```

The engine spawns Claude. Tool pills stream to the Customize panel
(collapsed by default). Claude reads the PDF, runs the Python pipeline,
writes `workbook.csv` + `workpaper.xlsx`. The engine's file watcher
emits `FilesChanged` over the WebSocket → the frontend re-reads the CSV
→ the transactions table renders live.

### The workpaper card

A persistent card above the tabs shows the Excel file status:

> 📊 **workpaper.xlsx** · 5 sheets · 14 KB
> *[✎ Ask to change]  [↗ Open in Excel]*

**↗ Open in Excel** calls the engine's `/v1/shell` route with
`open "<path>"` — macOS launches Excel or Numbers with the file. The
workpaper has:

- **Summary** — totals by category with live SUM formulas + money formatting
- **Transactions** — all rows, frozen header, colored amounts
- **One sheet per statement** — filtered rows for each uploaded PDF,
  with a subtotal SUM at the bottom

### The tabs below the card

- **Transactions** (default) — flat sortable table
- **Summary** — KPI cards (Money in / Out / Net / Transactions) + per-category breakdown
- **Source documents** — every uploaded PDF with clean name + upload time + size

### The Customize panel (right rail, click or ⌘K)

A Cursor-style slim panel. Pre-filled with four example prompts:

- "Add a Tax column that detects GST and VAT"
- "Remember that Acme charges are always Cloud"
- "Merge these receipts from John into the table"
- "Split Description into Merchant and Memo"

Every prompt you type gets silently prefixed with
`(client: <name>, folder: clients/<slug>/)` so the agent always has
context. Press Enter → the agent does its thing → the table and/or
workpaper update live in the background.

---

## The soft-workflow demo

Three prompts that tell the full story:

1. **"Add a Tax column that detects GST and VAT."**
   Agent edits `scripts/generate_workbook.py` — adds a `tax` computed
   column + extends the xlsx sheets. Every future statement (for every
   client) gets the column. No engineering ticket.

2. **"For Acme, all AWS charges should be Cloud, not Uncategorized."**
   Agent appends to `clients/acme/rules.md`. The
   `extract_transactions.py` pipeline reads this file per-client on
   every run. Scoped rule, zero runtime cost.

3. **"Highlight refunds in red in the Excel."**
   Agent edits the `write_xlsx` function in `generate_workbook.py`,
   adding an `openpyxl` conditional format for positive amounts.
   Re-runs the pipeline for the current client. New file has the
   highlighting.

All three land as **code changes on disk** the user can read, commit,
or revert with `git`.

---

## Architecture

```
+--------------------+         HTTP + WebSocket         +---------------------+
|  SmartBooks (this) |  <------------------------------> |   houston-engine    |
|  React + Vite      |   @houston-ai/engine-client SDK  |  (Rust, axum)       |
+--------------------+                                   +----------+----------+
                                                                    |
                                                            spawns subprocess
                                                                    v
                                                          +-------------------+
                                                          | claude / codex CLI |
                                                          +---------+---------+
                                                                    |
                                                              read/write fs
                                                                    v
                                                 ~/.houston/workspaces/SmartBooks/
                                                   Bookkeeper/
                                                     CLAUDE.md              (persona)
                                                     scripts/*.py           (deterministic pipeline)
                                                     clients/<slug>/
                                                       client.json          (metadata)
                                                       statements/*.pdf     (input)
                                                       workbook.csv         (flat source of truth)
                                                       workpaper.xlsx       (deliverable)
                                                       rules.md             (per-client overrides)
```

**Everything the frontend does** is via the engine wire. Listing
workspaces, creating the agent, seeding scripts, uploading files,
starting a session, streaming feed items, listening for file changes,
opening the xlsx on the host — every call goes through HTTP + WS.

The frontend has **zero direct filesystem access**. It never reads or
writes disk; it asks the engine to do things and subscribes to events.

---

## Files

| Path | What |
|---|---|
| [src/App.tsx](src/App.tsx) | Three-pane shell, connection state, ⌘K keyboard |
| [src/lib/engine.ts](src/lib/engine.ts) | `HoustonClient` + `EngineWebSocket` singletons |
| [src/lib/config.ts](src/lib/config.ts) | Three-tier engine-config resolution, localStorage |
| [src/lib/bootstrap.ts](src/lib/bootstrap.ts) | Idempotent workspace + agent setup + **watcher start** |
| [src/lib/clients.ts](src/lib/clients.ts) | Client CRUD, CSV parse, upload, openFileOnHost |
| [src/lib/seed.ts](src/lib/seed.ts) | Bookkeeper CLAUDE.md + two Python scripts as strings |
| [src/lib/feed.ts](src/lib/feed.ts) | `FeedItem` / `HoustonEvent` types + message reducer |
| [src/components/Sidebar.tsx](src/components/Sidebar.tsx) | Clients list + `+ New` |
| [src/components/ClientView.tsx](src/components/ClientView.tsx) | Main pane — drop canvas, auto-process, table |
| [src/components/Workpaper.tsx](src/components/Workpaper.tsx) | Workpaper card + Transactions/Summary/Files tabs |
| [src/components/TransactionsTable.tsx](src/components/TransactionsTable.tsx) | CSV → grid |
| [src/components/ChatPanel.tsx](src/components/ChatPanel.tsx) | Collapsed "Customize" rail + expanded chat |
| [src/components/NewClientDialog.tsx](src/components/NewClientDialog.tsx) | Modal |
| [src/components/ConnectScreen.tsx](src/components/ConnectScreen.tsx) | Fallback if the engine is unreachable |
| [src/styles.css](src/styles.css) | SmartBooks brand — warm ink + serif, deliberately unlike Houston |

---

## Gotchas (things a custom frontend must do)

These are load-bearing things I hit while building this example — any
custom frontend consuming houston-engine will need them too.

### Start the filesystem watcher

When the Claude CLI writes a file via its own Write/Edit tool, the
engine has no idea unless the filesystem watcher is running. Call
`client.startAgentWatcher(agentPath)` exactly once after you resolve
the agent folder, otherwise `FilesChanged` never fires for agent-side
writes and your UI looks frozen.

See [src/lib/bootstrap.ts](src/lib/bootstrap.ts).

### Subscribe to WS topics before starting a session

The `/v1/ws` forwarder drops events that arrive before the client has
subscribed to their topic. Subscribe to `session:<key>` and
`agent:<path>` first, then fire `POST /v1/agents/:path/sessions`. See
[src/components/ChatPanel.tsx](src/components/ChatPanel.tsx).

### Handle the feed-item reducer

`assistant_text_streaming` deltas replace the last in-progress
`assistant` message; `assistant_text` finalizes it. Don't append every
streaming delta as a separate message or you'll get 1000 rows per
reply. See `appendFeedItem` in [src/lib/feed.ts](src/lib/feed.ts).

### openpyxl for .xlsx

The pipeline needs `openpyxl` on the runtime machine. If Python
imports fail, the script tells the agent to `pip install openpyxl` —
the agent has Bash and will do it on first run. Pre-install to
skip that round-trip in a production deployment.

### Opening host-side files

The engine can only serve text on read routes today. For binary
files (xlsx, pdf), call `POST /v1/shell` with `open "<path>"` (macOS)
or `xdg-open` (Linux) or `start` (Windows) to hand the file to the
host OS's default application. See `openFileOnHost` in
[src/lib/clients.ts](src/lib/clients.ts).

---

## Reset

Anything weird:

```bash
# Kill processes
kill $(pgrep houston-engine)  # or Ctrl+C in the engine's terminal

# Wipe scratch data
rm -rf /tmp/smartbooks-home /tmp/smartbooks-docs

# Wipe frontend state (in browser console):
localStorage.clear()

# Restart engine + Vite (see step 1 + 2 above)
```

---

## Build your own

Copy this whole directory, rename the workspace/agent in
[src/lib/bootstrap.ts](src/lib/bootstrap.ts), swap the Python seeds in
[src/lib/seed.ts](src/lib/seed.ts) for whatever tools your agent needs,
restyle. That's the whole template.

For richer integrations, study the `@houston-ai/engine-client` surface
— it exposes every REST route and the WebSocket event bus. The engine
is frontend-agnostic by design; you don't have to look or feel like
Houston at all.

# Dual-profile parity gate (the P6 deletion gate)

`engine/` (the Rust engine, ~51k LOC) is the rollback + parity oracle. It is
deleted at **P6 — and only after this gate is green on real data in prod.**
Deleting it earlier removes the safety net before the new path is proven. This
file is the gate: what "the local host and the cloud host behave identically"
concretely means, split into the **two sections that matter operationally**:

1. **Automated (runs in CI on every PR)** — the machine-checked surface. Anyone
   can read the table below and see exactly which behavior each test pins.
2. **Manual gate** — the minimal ordered list a human runs ONCE, on the
   packaged app, with a real provider. These rows need a streaming LLM turn, a
   provider OAuth, a browser, and the OS shell — none automatable until a
   non-interactive test-provider credential exists (stated, not hidden).

The promise being verified: **one host, two adapter profiles, zero drift.** The
same router, `authorize()` seam, domain layer, and event emitter are compiled
into both deployments; they differ ONLY in which adapters `main()` wires
(`store`, `vfs`, `paths`, identity, bus, launcher, channel, scheduler,
capabilities). Drift = a second copy of any handler, or a handler that branches
on the deployment instead of on a port. There must be none.

Run the whole automated gate: `cd packages/control-plane && bun test`.

---

## Section 1 — Automated (runs in CI on every PR) ✅

Everything below is machine-checked by `bun test` in
`.github/workflows/ci.yml` on every pull request. No human needed.

### 1a — Port contract suites

Each port's adapters run against ONE shared suite, so an adapter that diverges
from the contract fails loudly.

| Port | Suite | Adapters under test | Live-service todo |
|---|---|---|---|
| WorkspaceStore | `src/store/contract.test.ts` | Memory, **Local** | Pg (`test.todo`) |
| CredentialStore | `src/credentials/contract.test.ts` | Memory, **File** | Pg (`test.todo`) |
| Vfs | `src/vfs/contract.test.ts` | Memory, **Fs** | Gcs (cloud integration) |
| RuntimeLauncher | `src/launcher/contract.test.ts` | Fake, **Process** (spawner doubles) | Gke (`test.todo`); CloudRun has no standing launcher by design |
| RuntimeChannel | `src/channel/contract.test.ts` | **Proxy**, **Turn** (both run locally) | — |
| TurnBus | `src/turn/bus.contract.test.ts` | Memory | Redis (`test.todo`) |
| WorkspacePaths | `src/paths.test.ts` | **Cloud**, **Local** (byte-identical keys) | — |

The `test.todo` entries are the honest gaps: they need a live Postgres / Redis /
Kubernetes apiserver to run and are exercised by the cloud deploy's own
integration pass, not by `bun test`. **Do not mark them done by deleting them.**

### 1b — Assembled dual-profile parity test

`src/dual-profile.test.ts` boots BOTH profiles over real HTTP (local via
`buildLocalHost` with a temp FS; cloud via the in-memory dev adapters +
`CloudPaths` + the real `CLOUD_CAPABILITIES`), drives an identical v3 request
battery through each, and asserts the normalized transcripts are byte-identical.
The day a shared handler grows a `profile === "cloud"` branch, or a route keys
off the on-disk layout instead of the `WorkspacePaths` seam, the transcripts
diverge and this fails.

### 1c — Behavior → test map (the machine-checked surface)

Every behavior the manual gate USED to carry that does NOT need a real LLM is
pinned here. Read this top-to-bottom to know what CI already guarantees.

| Behavior | Test file(s) |
|---|---|
| Same v3 wire behavior across both profiles (agent CRUD, activities, routines + both cron gates, config, skills lifecycle incl. dup→409, raw↔typed agentfile agreement, portable export→preview, 401 wall) | `src/dual-profile.test.ts` |
| Documented asymmetries are EXACTLY the intended ones (capabilities: revealInOs/terminal/codeExecution/providers; tunnel off everywhere; one protocol version) | `src/dual-profile.test.ts` |
| Local host boots from the on-disk desktop tree (workspaces/agents read from disk, slash-bearing agent id round-trips the URL, preferences persist, boot-token wall) | `src/local/host.test.ts` |
| Typed `.houston` families served by the host (activities/routines/config/learnings CRUD, schema seeding on create, ownership 403, agent-written junk → diagnostics, 503 with no vfs) | `src/routes/agent-data.test.ts` |
| Skills lifecycle over the host (create→list→read→edit→delete, dup→409, ownership wall) | `src/routes/agent-data.test.ts` |
| **A skill created via the API lands at the EXACT on-disk path pi loads** (`.agents/skills/<slug>/SKILL.md`, real FsVfs) — "the agent uses it next session" made concrete | `src/local/reactivity.test.ts` |
| Routine fires on schedule: scheduler scans, fires due-in-window once, records a running run, dedups across replicas, marks errored never stuck, account-timezone re-times | `src/schedule/scheduler.test.ts` |
| Routine firer routes the prompt through the same channel a user message uses (incl. model/effort pins); ProxyChannel.fireTurn POSTs to the runtime conversation endpoint | `src/schedule/firer.test.ts` |
| Run a routine on demand over HTTP (records a run, calls fireTurn with the prompt, suppression instruction rides the prompt, fire-failure→502+errored, unknown→404, cross-user→403) | `src/routes/run-routine.test.ts` |
| Routine run reconciles: silent (ROUTINE_OK+suppress, no card) vs surfaced (→ `needs_you` board Activity), pre-start replies ignored, 15-min timeout→errored, activity reused across runs | `src/schedule/reconcile.test.ts` |
| Board live-reactivity (host mutation): a mutation emits its HoustonEvent on the owner's `/v1/events` stream and NEVER another tenant's; 503 with no hub; auth required | `src/routes/events-stream.test.ts` |
| **Board live-reactivity (direct file write, LOCAL profile): a raw `.houston` write surfaces the right HoustonEvent on `/v1/events` — the FsWatcher → EventHub → SSE keystone, assembled over HTTP** | `src/local/reactivity.test.ts` |
| Path → event classification (activity/routines/routine_runs prefix overlap, conversations, skills, context, files; non-classifiable dropped; Windows backslashes) | `src/watch/classify.test.ts` |
| FsWatcher: a real `fs.watch` write surfaces a classified, debounced event; stop() halts delivery | `src/watch/watcher.test.ts` |
| Composer attachments: bytes land at the relative path the agent's clamped Read tool resolves, binary round-trips byte-for-byte, dup-name disambiguation, invisible to the Files tab, delete scoping, traversal rejected, HTTP POST/DELETE handler, 400/503 paths | `src/turn/attachments.test.ts` |
| Files tab over the host (lists the agent's files; `.houston`/`.agents` hidden + refused) | `src/turn/files.test.ts` |
| Composio integration path against the FAKE provider (login/poll→credential, toolkits/connections/connect/disconnect gated on a connected cred, logout, unknown→404, 401, and the runtime-facing `/sandbox/integrations/{search,execute}` HMAC proxy: owner's key resolved host-side, `integration_search`/`integration_execute` answered, the user key never crosses, bad-token→401, no-cred→409, 503 unconfigured) | `src/routes/integrations.test.ts` |
| Chat-history migration into v3 conversations + a synthesized resumable pi session (idempotent `.migrated` marker, source read-only) | `src/migrate/chat-history.test.ts` |
| Chat-history migration verified against a copy of REAL Rust-era data | `src/migrate/chat-history.real.test.ts` (see `convergence/migration-gate.md`) |

> **Why these are NOT in the manual gate:** none needs a real provider OAuth or
> a streaming LLM turn. They prove the handler, the wire, the on-disk layout,
> the scheduler, and the reactivity detector — all the way over real HTTP /
> a real filesystem — with the fake spawner + the in-memory/fake adapters.

---

## Section 2 — Manual gate (the user runs once, on the packaged app, with a real provider) ⬜

Automation above pins every handler, the wire, the on-disk layout, the
scheduler, and BOTH reactivity detectors. It cannot prove the parts that need a
real provider OAuth, a real pi runtime completing a streaming turn, a browser,
and the OS shell — those are the human gate.

Run each row IN ORDER on the **packaged, notarized desktop `.app`** (local
profile). Cross-link:

- **Build / obtain the packaged app + the dev-vs-packaged distinction** →
  `convergence/packaged-app-launch.md` (the host sidecar is only SPAWNED by the
  real `.app`, never by `pnpm tauri dev`).
- **The migrated-conversation rows (3, 12)** → `convergence/migration-gate.md`
  (already verified against a copy of real Rust-era data; here you confirm it
  end-to-end in the live app).

Where a row is also meaningful on the web app pointed at a host (cloud or
self-host profile), the expected result is the same EXCEPT the rows marked
local-only and the connect-providers asymmetry (local: Anthropic + Codex; cloud:
Codex only).

| # | Do this | Observe | Pass when |
|---|---|---|---|
| 1 | Launch the notarized `.app` (not `pnpm tauri dev`). | The window opens; the Tauri shell spawns the bundled host sidecar (look for `HOUSTON_HOST_LISTENING` in the app log). | No Gatekeeper block; the sidecar comes up and the UI reaches it (board loads, no spinner-of-death). |
| 2 | Connect a provider via the OAuth flow. | The connect dialog completes; provider status flips to connected. | The flow finishes and the agent can run a turn. Local offers Anthropic + Codex; cloud Codex only. |
| 3 | Open a MIGRATED chat (local-only), then ask the agent about something earlier in it. | History is visible AND the agent's reply shows it remembers the prior context (the synthesized pi session resumed). | Both: the transcript renders and the agent answers with memory of it. |
| 4 | Send a chat message and watch it stream. | `sync` → `text`/`thinking`/`tool_*` → `done` arrive live; the board card moves to a finished state. | Tokens stream into the bubble; the card does NOT hang in "running" forever. |
| 5 | Create a routine with a GOOD cron, and (separately) try a BAD cron. | Good saves; bad is rejected inline. Then wait for the good one's scheduled instant. | Good cron saves + actually FIRES on schedule (a run is recorded); the invalid cron is rejected in the UI (400), never silently dropped. |
| 6 | Run a routine on demand (the "run now" affordance). | A run record appears and completes. | Silent run → no card; a surfaced run → a `needs_you` card on the board. |
| 7 | Edit one of the agent's `.houston` files directly on disk (or have the agent write one), with the board open. | The board updates. | It updates with NO manual refresh (FS watcher → live reactivity). |
| 8 | Attach a file in the composer, then ask the agent to use its contents in the turn. | The agent reads the attachment. | The agent's reply reflects the file's contents (it Read the uploaded file during the turn). |
| 9 | Open the Files tab. | The agent's working files list; internal dirs do not. | `.houston` / `.agents` are hidden AND refused if addressed directly. |
| 10 | Connect Composio (your own free account) and run one tool through the agent. | The connect/OAuth completes; the agent invokes `integration_search`/`integration_execute`. | A real toolkit action runs end-to-end through the host's `/sandbox/integrations` proxy (your key never reaches the runtime). |
| 11 | Walk the first-run onboarding after the cut. | No links/buttons to removed features. | No dead-ends (store/marketplace/worktrees/mobile/gemini); the first-run flow completes. |
| 12 | Reveal-in-OS / open a terminal from the app (local-only). | The OS file reveal / terminal opens on desktop; the same affordances are ABSENT on web. | Present on desktop, gated on `/v1/capabilities` (not a web/desktop branch) — absent on web. |
| 13 | After migrating, install a Rust-engine build over the same `~/.houston` and boot it (local-only). | The old build still reads the untouched tree + `houston.db`. | It boots and reads everything (migration is copy-never-move → downgrade always works). |
| 14 | Force-quit the app (or quit normally). | The host sidecar + any spawned pi runtimes exit. | No orphan `houston-engine` / runtime processes left behind (`pgrep`); the supervisor tore them down. |

> **On Playwright:** a browser E2E that asserts rows 2–10 automatically is worth
> adding once a non-interactive **test-provider credential** exists (chat can't
> complete without one, so a credential-less Playwright run would be theater).
> Until then this section is human-run; that limit is stated rather than hidden.

---

## Documented asymmetries (accepted — NOT drift)

Zero drift means zero duplicated domain logic, not an identical behavior matrix.
These differ by construction and are contained in adapters / capabilities (and
are asserted to be the ONLY differences by `src/dual-profile.test.ts`):

- **Capabilities** (`src/capabilities.ts`): local has `revealInOs` + `terminal`
  + `local-bash` + Anthropic; cloud has none of those + `remote-sandbox` +
  Codex-only. The UI gates on these flags, never on "am I web/desktop".
- **Unknown token** → **401 local, 403 cloud** for a *different* user: local is
  single-user (the identity seam rejects any non-owner token at verify time);
  cloud authenticates a real second user then walls them at authorization. Both
  are "you can't touch someone else's agent" — different layer, same guarantee.
- **Workspaces list**: local reflects the on-disk `~/.houston/workspaces` tree;
  cloud returns the one synthetic personal workspace.
- **Reactivity mechanism**: local = FS watcher (`src/local/reactivity.test.ts`);
  cloud = post-turn sync emitting synthetic `FilesChanged`. Same `HoustonEvent`
  vocabulary, different detector.
- **bash confinement**: local bash runs with the user's own authority (same as
  the desktop has always been); cloud uses the egress-locked sandbox.

## The rollback invariant (why the gate can fail safe)

Migration is **copy-never-move**: the new desktop build writes only under
`<agent>/.houston/runtime/`, never touches the Rust-era tree or `houston.db`, and
is idempotent (a `.migrated` marker). So downgrading to a Rust-engine build
always works — which is what lets the beta soak on the new path while stable
stays on the old one, and what makes deleting `engine/` at P6 reversible by
`git revert` rather than a data-restore.

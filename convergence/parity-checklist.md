# Dual-profile parity gate (the P6 deletion gate)

`engine/` (the Rust engine, ~51k LOC) is the rollback + parity oracle. It is
deleted at **P6 — and only after this gate is green on real data in prod.**
Deleting it earlier removes the safety net before the new path is proven. This
file is the gate: what "the local host and the cloud host behave identically"
concretely means, split into the layers that are automated (run in CI) and the
layer that needs a human + real providers + a browser.

The promise being verified: **one host, two adapter profiles, zero drift.** The
same router, `authorize()` seam, domain layer, and event emitter are compiled
into both deployments; they differ ONLY in which adapters `main()` wires
(`store`, `vfs`, `paths`, identity, bus, launcher, channel, scheduler,
capabilities). Drift = a second copy of any handler, or a handler that branches
on the deployment instead of on a port. There must be none.

---

## Layer 1 — Port contract suites (automated, in CI) ✅

Each port's adapters run against ONE shared suite, so an adapter that diverges
from the contract fails loudly. Run: `cd packages/control-plane && bun test`.

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

## Layer 2 — Assembled dual-profile parity test (automated, in CI) ✅

`src/dual-profile.test.ts` boots BOTH profiles over real HTTP (local via
`buildLocalHost` with a temp FS; cloud via the in-memory dev adapters +
`CloudPaths` + the real `CLOUD_CAPABILITIES`) and drives an identical v3 request
battery through each, then asserts the normalized transcripts are byte-identical.
It covers: agent create + validation, activities CRUD, routines (create + both
validation gates + list + runs), config, skills lifecycle (incl. dup → 409), raw
agentfile ↔ typed read agreement, a portable export → preview round trip, and the
401 wall. Ids / workspace ids / timestamps are normalized out (those differ by
design); everything else must match exactly. It also asserts the capability
constants are each profile's real one and that the ONLY differences are the
documented asymmetries below.

This is a **guard**: the day a shared handler grows a `profile === "cloud"`
branch, or a route keys off the on-disk layout instead of the `WorkspacePaths`
seam, the transcripts diverge and this fails.

## Layer 3 — Live dual-profile checklist (manual, needs the running apps) ⬜

Automation above pins the handlers and the wire. It cannot prove the parts that
need a real provider OAuth, a real pi runtime completing a turn, a browser, and
the OS shell. Those are the human gate. Run each row on BOTH the packaged
desktop `.app` (local profile) and the web app pointed at a host (cloud or
self-host profile); the expected result is the same on both except where a row
is explicitly marked local-only.

Build the desktop: `bash scripts/build-host-sidecar.sh && cd app && VITE_NEW_ENGINE=1 pnpm tauri build --features host-sidecar`.
Run a host for the web app: see the QA host command in `convergence/README.md` /
the status memo.

| # | Scenario | Pass when |
|---|---|---|
| 1 | Connect a provider (OAuth) | The connect flow completes; the agent can run a turn. Local offers Anthropic + Codex; cloud Codex only. |
| 2 | Send a chat turn; it streams | `sync`/`text`/`thinking`/`tool_*`/`done` arrive; the card does NOT hang in "running". |
| 3 | Open a MIGRATED chat (local-only) | History is visible AND the agent remembers it (the synthesized pi session resumed). |
| 4 | Create a skill in the UI | It appears in the list; the agent uses it next turn (no restart). |
| 5 | Create a routine; bad cron | Good cron saves + fires on schedule; an invalid cron is rejected in the UI (400), not silently dropped. |
| 6 | Run a routine on demand | A run is recorded and completes (silent → no card; surfaced → a `needs_you` card). |
| 7 | Board live-reactivity | An agent-written `.houston` change (or a file written outside the UI) updates the board with no manual refresh. |
| 8 | Attachments | An uploaded file is readable by the agent during the turn. |
| 9 | Files tab | Lists the agent's files; `.houston` / `.agents` are hidden and refused. |
| 10 | Onboarding after the cut UI | No dead-ends to removed features (composio/store/worktrees/mobile/gemini); the first-run flow completes. |
| 11 | Reveal-in-OS / terminal (local-only) | Present on desktop; absent on web (gated on `/v1/capabilities`, not a web/desktop branch). |
| 12 | Downgrade safety (local-only) | After migrating, a Rust-engine build still boots and reads the untouched tree + db (migration is copy-never-move). |

> Note on Playwright: a browser E2E that asserts rows 2–9 automatically is
> worth adding once a non-interactive **test provider credential** exists (chat
> can't complete without one, so a credential-less Playwright run would be
> theater). Until then this checklist is human-run; that limit is stated rather
> than hidden.

---

## Documented asymmetries (accepted — NOT drift)

Zero drift means zero duplicated domain logic, not an identical behavior matrix.
These differ by construction and are contained in adapters / capabilities:

- **Capabilities** (`src/capabilities.ts`): local has `revealInOs` + `terminal`
  + `local-bash` + Anthropic; cloud has none of those + `remote-sandbox` +
  Codex-only. The UI gates on these flags, never on "am I web/desktop".
- **Unknown token** → **401 local, 403 cloud** for a *different* user: local is
  single-user (the identity seam rejects any non-owner token at verify time);
  cloud authenticates a real second user then walls them at authorization. Both
  are "you can't touch someone else's agent" — different layer, same guarantee.
- **Workspaces list**: local reflects the on-disk `~/.houston/workspaces` tree;
  cloud returns the one synthetic personal workspace.
- **Reactivity mechanism**: local = FS watcher; cloud = post-turn sync emitting
  synthetic `FilesChanged`. Same `HoustonEvent` vocabulary, different detector.
- **bash confinement**: local bash runs with the user's own authority (same as
  the desktop has always been); cloud uses the egress-locked sandbox.

## The rollback invariant (why the gate can fail safe)

Migration is **copy-never-move**: the new desktop build writes only under
`<agent>/.houston/runtime/`, never touches the Rust-era tree or `houston.db`, and
is idempotent (a `.migrated` marker). So downgrading to a Rust-engine build
always works — which is what lets the beta soak on the new path while stable
stays on the old one, and what makes deleting `engine/` at P6 reversible by
`git revert` rather than a data-restore.

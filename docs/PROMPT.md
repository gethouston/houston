# PROMPT — Houston Mobile · Continue from 2026-05-24 Handoff

You are picking up the **Houston Mobile (Capacitor native)** project in a fresh session. Four PRs landed in the prior session, the protocol + push policy are done, and there is one well-bounded next increment that's genuinely dogfoodable. Everything past it needs Apple / Google / device resources that the build host doesn't have — those chunks are blocked, not done. Do not generate code for them.

This prompt is the single source of truth for resuming the work. Treat it as your context root; re-read it whenever you lose thread.

## Read these first (in order)

1. `docs/specs/2026-05-24-houston-mobile-session-handoff.html` — formal handoff record (what landed, decisions, caveats).
2. `docs/specs/2026-05-23-houston-mobile-capacitor.html` — the canonical architecture spec.
3. `docs/mobile-architecture.md` § "Native shell (Capacitor)" — the agent-readable summary.
4. `engine/houston-tunnel/src/frame.rs` — `TunnelFrame`, `NotifyKind`, `NotifyFrame` (the wire contract).
5. `engine/houston-tunnel/src/notify.rs` — `NotifyPolicy` + `status_to_notify_kind` (the policy core you will call).
6. `engine/houston-tunnel/src/connection.rs` — current send path (the file you will extend).
7. `engine/houston-ui-events/src/lib.rs` — `HoustonEvent::SessionStatus`, `BroadcastEventSink` (your event source).
8. `engine/houston-engine-core/src/agents/activity.rs` — confirms the status vocabulary `status_to_notify_kind` maps.

## Current state (verify with `git fetch fork main && git log fork/main -5`)

- Four PRs merged on the broomva fork: **#28** (Capacitor shell), **#32** (Notify v1, superseded), **#40** (Notify v2 — `loc-key` shape, industry best practice), **#42** (NotifyPolicy + status mapping).
- `engine/houston-tunnel` exposes the wire contract + the policy. Both have full unit tests.
- The push pipeline has **no consumer yet** — no event subscriber, no outbound-frame send path. That is your next PR.

## Decisions already locked (do NOT relitigate)

- **D1** Client = Capacitor (not PWA / not Tauri-mobile / not Expo-RN).
- **D2** Backend = Mac tunnel only (engine can never run on-device — it spawns CLI subprocesses).
- **D3** Push origin = relay, driven by engine-emitted `Notify` frame.
- **D4** iOS first; Android deferred until SDK provisioning.
- **D5** Branch base = `fork/main` (bun), **never** `origin/main` (pnpm) — dual-lockfile conflict.
- **D6** Notification localization = device-side, APNs `loc-key` + FCM `body_loc_key`. The frame carries only `notifyKind` + `locArgs`; pre-localized `title`/`body` is wrong.

## Your task: the subscriber + tunnel outbound-frame channel

Three components in this order. **One PR.**

### 1. Outbound-frame channel on `TunnelClient`

In `engine/houston-tunnel/src/connection.rs`:

- Add a `tokio::sync::mpsc::Sender<TunnelFrame>` field to `TunnelClient` (paired with a `Receiver` consumed inside `run_once`).
- Expose `TunnelClient::outbound_frame_sender() -> mpsc::Sender<TunnelFrame>` (cheap clone — call sites hold the `Sender`).
- In the dispatch loop (`connection/dispatch.rs` / `connection/session.rs` — whichever owns the WS write half), `select!` between the existing inbound-frame branch and an outbound-frame branch that reads the receiver and writes the frame to the relay WS as JSON.
- Drop the receiver on disconnect; reconnect creates a fresh pair. Backpressure: bounded channel (suggest capacity 64); on full, log + drop (notifications are advisory, not a delivery guarantee).

**Tests** (no external WS needed): construct a `(Sender, Receiver)`, push a `TunnelFrame::Notify(...)`, drain into a mock sink that converts to JSON, assert the JSON matches the expected `{"kind":"notify",...}` shape.

### 2. Notify-dispatcher task

Location: `engine/houston-engine-server` (the binary that wires up `BroadcastEventSink` + `TunnelClient`). Either a new module file or a free function — caller's choice.

Public surface:

```rust
pub fn spawn_notify_dispatcher(
    mut events: tokio::sync::broadcast::Receiver<houston_ui_events::HoustonEvent>,
    policy: std::sync::Arc<tokio::sync::Mutex<houston_tunnel::NotifyPolicy>>,
    tunnel_tx: tokio::sync::mpsc::Sender<houston_tunnel::TunnelFrame>,
) -> tokio::task::JoinHandle<()>;
```

Behavior, per `HoustonEvent::SessionStatus { agent_path, session_key, status, error }`:

1. `let kind = houston_tunnel::status_to_notify_kind(&status)?;` (skip non-notify-worthy).
2. `let now_ms = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as i64;`
3. `match policy.lock().await.decide(kind, &session_key, now_ms) { Emit => build + send; Skip(reason) => tracing::debug! reason }`.
4. Build: `TunnelFrame::Notify(NotifyFrame { notify_kind: kind, loc_args: vec![agent_name], session_key })`. **The `loc_args` shape for each `NotifyKind` is a product decision — start with `[agent_name]` for all three (`NeedsYou` / `Finished` / `Failed`) and revisit when the bundled `Localizable.strings` lands.** Agent name comes from `agent_path` (basename) or from looking up the activity row — pick the cheaper path and document the choice in the PR body.
5. `tunnel_tx.try_send(frame)` — non-blocking. Log on `TrySendError::Full` (notifications are advisory) and `TrySendError::Closed` (tunnel restarted; receiver dropped — the next reconnect cycle will install a fresh pair).

Other event variants: ignore.

**Tests**: synthetic broadcast stream emits a few `SessionStatus` events; assert the right `NotifyFrame`s arrive at a mock `mpsc::Receiver`. Verify dedup + cap by emitting duplicates / overflowing.

### 3. Wire it in

In the engine binary's startup (where `BroadcastEventSink` + `TunnelClient` are currently constructed): create the `Arc<Mutex<NotifyPolicy::default()>>`, get the tunnel's `outbound_frame_sender()`, subscribe to the broadcast sink, spawn the dispatcher.

If the engine doesn't currently wire a `TunnelClient` in all configurations (e.g., it's gated on `houston-tunnel` being enabled), gate the dispatcher spawn on the same condition.

### Verification (P11 — required before declaring done)

- `cargo test -p houston-tunnel` — all tunnel tests still pass.
- `cargo test -p houston-engine-server` (or wherever the dispatcher lives) — new dispatcher tests pass.
- `cargo build --workspace` — green.
- `bun run typecheck` (workspace) — green (the TS twin doesn't change in this PR, but the lint hook runs it).
- The pre-commit hook will exercise `rustfmt + typecheck + check-locales` — run `cargo fmt -p <crate>` first if your edits include long lines.

### Scope discipline (RULE 0)

- Do **not** also implement the relay's APNs / FCM sender — that needs Apple `.p8` + FCM service-account creds that aren't here. That's a separate PR after credentials are in `wrangler secret`.
- Do **not** modify the `NotifyFrame` shape or `NotifyKind` — they're settled. If you're tempted, document why in the PR body first.
- Do **not** push follow-up commits to an armed-auto-merge branch — open a new branch (race observed on #32 → #40).
- Do **not** use `origin/main` as the branch base — use `fork/main` (D5).
- Do **not** invent `locArgs` semantics beyond `[agent_name]` without product input — start there, mark as v1, revisit when the device-side `Localizable.strings` lands.

## Operating mode

bstack autonomous. Apply the primitives:

- **Snapshot (P15)** before planning — `git fetch fork main && git log fork/main -3`, `gh pr list --repo broomva/houston --state open`.
- **Dep-Chain (P14)** the call sites: `rg "BroadcastEventSink::new\|EventSink::emit"` in `engine/houston-engine-server` to find where the sink is constructed; same for `TunnelClient::new`. Enumerate before writing.
- **Empirical (P11)** every chunk — `cargo test -p <crate>` + the workspace pre-commit gate.
- **Pipeline (P4)** fork-first: branch off `fork/main`, push to `fork`, open PR `--head <branch>` `--base main` on `broomva/houston`, enable CI-gated `--squash --auto --delete-branch`. Do not touch the upstream `origin/houston` PR for this work — it's blocked on a bun→pnpm rebase that's not your concern.
- **Cross-Review (P20)** — the user previously chose CI-gated merge over a separate cross-review pass; mirror that unless the diff has algorithmic content beyond glue. A bounded subagent code-review on the dispatcher logic is reasonable.

## Caveats observed in the prior session (avoid re-discovering)

- **iOS simulator SPM resolution stalls** on Xcode 26.3 under any I/O contention. Trust CI for the iOS build; don't burn turns locally.
- **Disk fills fast.** This host has been hovering near full. Rust target dirs are the biggest reclaim — `find ~/broomva ~/conductor -type d -name node_modules -prune -o -type d -name target -prune -print` and check for `CACHEDIR.TAG` before deleting.
- **Pre-commit `rustfmt --check`** is strict on line length. Run `cargo fmt -p <crate>` before committing or expect the hook to revert.
- **Linear MCP is not connected** (and the `authenticate` tool isn't surfacing — connector likely removed). When you need ticketing, ask the user to re-add the Linear connector in claude.ai → Settings → Connectors → +Add Linear → authorize the **Broomva** workspace (NOT Stimulus). Previous Stimulus tickets BRO-49…54 are canceled and need manual UI deletion.

## Honest stopping line

After the subscriber + outbound-channel PR lands, every remaining chunk needs external resources. Do not generate unvalidatable code. Surface the credential / device / account requirements crisply and stop:

- **Relay APNs / FCM sender** needs `wrangler secret put APNS_AUTH_KEY_P8` (+ key id + team id) and `wrangler secret put FCM_SERVICE_ACCOUNT_JSON`.
- **On-device push handler** (Chunk 3) needs a physical device or simulator with push entitlement + `aps-environment` configured.
- **Biometric** (Chunk 4) and **camera QR** (Chunk 5) need a physical device.
- **Store CI** (Chunk 6) needs Apple Developer ($99/yr) + Google Play ($25) + signing certs + provisioning profiles + APNs key + FCM service account + upload key.

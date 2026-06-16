# Provider Errors — typed taxonomy + classifier contract

Caveman style. Skim the table of contents and load the section that
touches what you are doing.

## TL;DR

Every AI provider's CLI failure collapses into one variant of the
`ProviderError` enum. The engine emits it as a typed
`FeedItem::ProviderError` over the wire. The frontend renders one
variant-specific card per kind with variant-appropriate CTAs. Adding a
new provider = implement two `classify_*` methods on the provider's
adapter; no new variants needed (they share the taxonomy).

`Unknown` is the catch-all — and it always shows a "Report bug" button
so we hear about it. Promote anything that fires `Unknown` repeatedly
into a real variant.

## The taxonomy

Defined in `engine/houston-terminal-manager/src/provider_error_kind.rs`
and mirrored in `ui/chat/src/types.ts`. The two MUST stay in sync.

| Variant                    | When it fires                                                                          | UI CTAs                                              |
|----------------------------|-----------------------------------------------------------------------------------------|------------------------------------------------------|
| `RateLimited`              | Per-minute / short-window throttle. Wait helps.                                         | Retry, Switch model, optional `retry_after_seconds`. |
| `QuotaExhausted`           | Long-window / billing-period limit. Wait won't help.                                    | Upgrade plan (`upgrade_url`), Switch provider.       |
| `UsageLimitPaused`         | Plan-window limit hit (today: Anthropic claude-code's 5-hour subscription session limit). Fires from `rate_limit_event` `status:"rejected"` (structured `resetsAt` epoch), a `429` result whose body names a session/usage limit + reset, or the stderr "usage limit ... reset at" banner. Retrying now fails — wait for the reset. | Chat: `UsageLimitPausedCard` (title + "resets at {time}" from `resets_at`, plus Switch model — a different provider has its own limit). Routines surface "Waiting · resumes at HH:MM" via `routine_run.paused_until`. |
| `ModelUnavailable`         | The requested model isn't available to this account (preview, deprecated, regioned).    | Switch to `suggested_fallback`, Pick another model.  |
| `Unauthenticated`          | Auth missing/expired/invalid. `cause` narrows the body copy.                            | Reconnect (drives `tauriProvider.launchLogin`); the card then WAITS on the `ProviderLoginComplete` WS event (launchLogin resolves at CLI spawn, not completion) and flips to a green "Reconnected" state with a retry CTA, or shows the failure and re-arms. |
| `NetworkUnreachable`       | Cannot reach the provider's API (DNS, connect refused, ECONNRESET).                     | Retry, Check status page.                            |
| `ProviderInternal`         | 5xx from upstream, transient infra failure.                                             | Retry, Check status page.                            |
| `SessionResumeMissing`     | Resume target is gone or unrecoverable. Codex: `no rollout found`. Anthropic: claude exits with `result/error_during_execution/duration_ms:0` on the very first stdout line — the `~/.claude/projects/<encoded-cwd>/<id>.jsonl` transcript is corrupt. Both runners auto-restart fresh; the card is informational. | Try again (re-sends after the auto-restart in case the fresh attempt also failed). |
| `MalformedResponse`        | CLI emitted unparseable JSON mid-stream.                                                 | Retry.                                               |
| `SpawnFailed`              | CLI couldn't even spawn (binary missing, killed by OS).                                  | Report bug.                                          |
| `Cancelled`                | User pressed Stop. Distinct so the UI shows nothing (no toast, no retry).                | none (rendered as `null`).                           |
| `Unknown`                  | No classifier matched. Carries `raw_excerpt` (≤500 chars).                              | Report bug.                                          |

## The classifier trait

`ProviderAdapter` (in `engine/houston-terminal-manager/src/provider/mod.rs`)
exposes three methods every adapter can override. All have default
impls so existing adapters keep compiling.

```rust
fn classify_stderr(&self, line: &str) -> Option<ProviderError>;
fn classify_result_error(&self, error_type: &str, error_message: &str) -> Option<ProviderError>;
fn classify_spawn_failure(&self, exit_code: Option<i32>, stderr_excerpt: &str) -> ProviderError;
```

- `classify_stderr` runs on every stderr line (hot path; keep it cheap).
- `classify_result_error` runs on structured `result {status:"error"}`
  events from the NDJSON parser. The `error_type` is the upstream
  class name (Gemini's `RetryableQuotaError`, etc.); the parser maps
  unrecognised types to `ProviderError::Unknown`.
- `classify_spawn_failure` is invoked when the process exits non-zero
  with no recognised stderr pattern. Default returns `SpawnFailed`.

## Wire flow

```
provider CLI
  ├── stderr line ── classify_stderr ── Some(ProviderError) ── FeedItem::ProviderError ── WS frame
  └── stdout NDJSON ── parser ── result.error ── classify_result_error ── FeedItem::ProviderError ── WS frame
```

Live in `engine/houston-terminal-manager/src/session_io.rs`
(`read_stderr_lines`) and `engine/houston-terminal-manager/src/gemini_parser_state.rs`
(`handle_result` → `classify_result_error`). Each session emits at most
one card per `kind` (deduped) so a 10-attempt backoff loop produces
ONE `RateLimited` card, not ten.

**Anthropic result events classify by HTTP code first.** claude-code sets
`is_error:true` with a numeric `api_error_status` (e.g. `429`) but the
`subtype` is often `"success"` and the human `result` string omits the
status word — so `parser.rs` tries `anthropic_classify::classify_api_error_status`
(401/403→`Unauthenticated`, 5xx→`ProviderInternal`) BEFORE the text-based
`classify_result_error`, then falls back to `Unknown`. Text matching alone
misfiled rate-limits as `Unknown` ("Report bug") — see Luis / 2026-06-09.

**429 splits two ways.** claude-code returns `429` for BOTH a genuine
short-window throttle AND the 5-hour subscription *session* limit. So
`classify_api_error_status(429, msg)` inspects the body: a session/usage limit
naming a reset ("You've hit your session limit · resets 3:30pm") →
`UsageLimitPaused` (wait, no "Retry now"); otherwise → `RateLimited` with the
`retry after Ns` countdown. The same limit also arrives mid-stream as
`rate_limit_event` events — `parse_rate_limit_event` keeps `allowed`/
`allowed_warning` SILENT (a warning is still allowed), maps `rejected` →
`UsageLimitPaused` reading the structured `resetsAt` epoch
(`anthropic_classify::format_reset_time`), and leaves genuine throttles as
`RateLimited`. Feed dedup by `(kind, provider)` collapses the mid-stream + the
terminal card to one. Before this, every `allowed_warning` raised a spurious
RateLimited card and the session limit showed a per-minute "Retry" card with
claude's raw English body — see Esteban / 2026-06-11.

**No double cards.** claude reports these failures on stdout with empty
stderr, then exits non-zero. `cli_process::handle_failed_exit` would
otherwise add its generic `SpawnFailed` fallback on top of the parser's
typed card, so the stdout reader sets `StdoutReadReport::saw_provider_error`
(via `mark_provider_error`) and the fallback is skipped when it is set
(alongside the existing `saw_auth_error` / `saw_model_unsupported_error`
guards).

**Codex terminal auth surfaces from stdout, like claude.** When ChatGPT
kills the login session server-side it returns `app_session_terminated` /
"Your session has ended. Please log in again." and codex loops
`Reconnecting... N/5` forever. The parser used to treat ALL of that as
deferred retry noise (`AUTH_RETRY_MARKER`), and the only `Unauthenticated`
card came from a stderr line emitted BEFORE `thread.started` — so it was
never persisted and vanished on reload, leaving the chat with just a red
border. Now `codex_parser` distinguishes a TERMINAL auth failure
(`auth_error::is_terminal_auth_error`) from a transient reconnect: terminal
emits `ProviderError::Unauthenticated` once (deduped via
`CodexAccumulator::auth_card_emitted`), fires after `thread.started` so it
persists, and renders the same login-button `UnauthenticatedCard` Claude
gets. Transient reconnects keep the deferred marker. The frontend
(`feed-to-messages`) also dedupes provider-error cards by `(kind, provider)`
so the transient stderr card and the persisted stdout card collapse to one.

Codex prints the kill in more than one phrasing — `is_auth_error` /
`is_terminal_auth_error` cover both "Your session has ended. Please log in
again." AND "Your access token could not be refreshed. Please log out and
sign in again." (the latter is NOT wrapped in `Reconnecting`, so it arrives
as a plain `error` event). EVERY codex auth failure — retry-wrapped or
plain — now funnels to a single `auth_card_emitted`-deduped
`Unauthenticated` card; before, the plain refresh-failure fell through to a
raw `Error: …` SystemMessage shown twice.

**Codex usage limit → `QuotaExhausted` (HOU-495).** A spent ChatGPT-account
Codex allowance fails every turn with `You've hit your usage limit. Upgrade to
Plus to continue using Codex (<url>), or try again at <date>.`, emitted on
stdout as BOTH an `error` and a `turn.failed` event. It is not a 429 throttle
and not the API-key `quota exceeded` billing error, so it matched no
`openai_classify::classify_stderr` branch and fell through to a raw `Error: …`
SystemMessage (shown twice) + a generic `codex hit a runtime error` status +
a `SpawnFailed` fallback card — the user saw no actionable next step, just
noise (the symptom behind "unable to use codex"). `classify_stderr` now maps
any `usage limit` line to `QuotaExhausted` (scope inferred from
`upgrade to plus` → `FreeTier` / `upgrade to pro` → `PaidPlan`; `upgrade_url`
lifted from the banner via `extract_first_url`, falling back to the ChatGPT
plan page). `CodexAccumulator::terminal_error_emitted` dedupes the
`error`+`turn.failed` pair to one card (the auth path keeps its separate
`auth_card_emitted` guard). The card is `QuotaExhaustedCard` — same "Upgrade
plan" CTA Anthropic/Gemini quota errors get.

**Auth cards: prefer the persisted inline card over the store card.** The
store-driven `ProviderReconnectCard` (anchored to the `authRequired` flag,
rendered in `ChatPanel.afterMessages`) AUTO-DISMISSES for codex: its 3s
`checkStatus` poll sees `~/.codex/auth.json` still present and clears
`authRequired`, so the login button flashes then vanishes. So
`use-agent-chat-panel.afterMessages` suppresses the store card whenever the
feed already carries an inline `provider_error` `unauthenticated` card for
this chat's provider — the persisted inline card is the stable surface.
(The underlying probe false-positive is still unfixed; it needs a
server-validating auth check.)

**Where the card actually mounts (don't let this regress).** A
`FeedItem::ProviderError` becomes a `ChatMessage` with `providerError` set
and `content: ""` (`ui/chat/feed-to-messages.ts`). The ONLY thing that
renders it is the app's `renderSystemMessage`
(`app/src/components/use-agent-chat-panel.tsx`), which must return
`<ProviderErrorCard error={msg.providerError} … />`. `chat-messages.tsx`
calls `renderSystemMessage(msg)` and, if it returns `undefined`, falls back
to rendering `msg.content` — which is `""`, i.e. NOTHING. For a long time
`renderSystemMessage` had no `providerError` branch, so EVERY typed card
(rate-limit, quota, the OpenAI/Claude reconnect button, …) silently
rendered as an empty span; the only auth UI that worked was the separate
store-driven `ProviderReconnectCard` in `afterMessages`. If you add a
variant, the dispatcher in `provider-error-card.tsx` is necessary but NOT
sufficient — the card only appears because `renderSystemMessage` mounts it.
`afterMessages` receives the RAW (unfiltered) feed (`@houston-ai/board`
`ai-board.tsx`), so its "suppress the store card when an inline auth card
exists" check can see the `provider_error` item.

## Adding a new provider

1. Implement `classify_stderr` + `classify_result_error` on the new
   adapter. Real fixtures > guessed regex.
2. Add unit tests to the classifier module with verbatim CLI output.
3. The frontend already knows every variant — no UI work needed unless
   the provider needs a custom status-page URL (see `statusPageUrl` in
   `app/src/components/shell/provider-error-cards/shared.tsx`) or a new
   provider-aware reconnect flow.
4. i18n keys are SHARED across providers (`shell:providerError.<variant>`),
   templated by `{{provider}}` — no new keys per provider unless the
   variant truly needs different wording.

## Adding a new variant

Resist if `Unknown` covers it. If you must:

1. Add the variant to `ProviderError` (Rust) + `ui/chat/src/types.ts`
   (TypeScript). Same `kind` discriminant.
2. Add an i18n keyset under `shell:providerError.<variant>` for en, es,
   pt. Run `pnpm check-locales` to verify parity.
3. Add a renderer file under
   `app/src/components/shell/provider-error-cards/<group>.tsx`. Pick
   the group by recovery shape (transient, auth, quota, terminal).
   Single-action / provider-branded variants (e.g. `UnauthenticatedCard`,
   `RateLimitedCard`) render via the shared `RowCard` (logo-left; see
   design-system.md); multi-button variants stay on `ErrorCard`
   (icon-bubble) in `shared.tsx`.
4. Add a `case` in `provider-error-card.tsx`'s dispatcher.
5. Update this doc's table.
6. Add the classifier(s) that produce the new variant.
7. `cargo test --workspace`, `pnpm tsc --noEmit`, `pnpm check-locales`,
   `pnpm vite build` — every gate green before committing.

## Login-flow failures (separate from session classification)

Everything above is about a **running session** — stderr / result events from a
spawned chat run, classified into the `ProviderError` card taxonomy. The
**login** flow (`provider::launch_login` in `houston-engine-core`) is a
different surface, and its failures are plain strings, not cards:

- sub-3s probe exit → `CoreError` → REST → toast description.
- >3s relay exit → `ProviderLoginComplete.error` (string) → toast description.

The login probe used to surface the CLI's first non-empty output stream
verbatim as the error. For codex that leaked its benign startup banner
`Starting local login server on http://localhost:1455.` as
`internal: codex login: <banner>` — no cause, no recovery (HOU-446). Plain
`codex login` runs a **fixed-port (1455)** loopback callback server; when it
can't start (port held by an orphaned prior login, or blocked by a firewall /
VPN / security tool) codex dies right after printing that banner.

The adapter now owns login diagnosis:
`ProviderAdapter::diagnose_login_failure(stdout, stderr) -> Option<LoginFailureHint>`
(default `None`). OpenAI overrides it (`provider/openai_login.rs`) to recognize
the login-server / port-1455 / address-in-use signature and return a clean,
recoverable message plus a stable `kind`. Both failure paths
(`login_early_exit_error` in `provider/mod.rs`, `make_login_error` in
`provider/login_relay.rs`) prefer the diagnosis; with none they fall back to the
raw stderr — still the actionable detail for a genuine login error. The
diagnosed error surfaces as
`CoreError::Labeled { code: Unavailable, kind, message }`: clean (no `internal:`
prefix), with `kind` reaching `error.details.kind` for future localized copy.

This is NOT a new `ProviderError` variant — login failures never render as
session cards, so they stay out of the taxonomy table above.

(Same fix biased the relay's stdout/exit `select!` so a fast-exiting CLI's
login URL is always drained before its exit is observed — see `login_relay.rs`.)

## File map

| Layer        | Path                                                                              |
|--------------|-----------------------------------------------------------------------------------|
| Rust enum    | `engine/houston-terminal-manager/src/provider_error_kind.rs`                      |
| Trait        | `engine/houston-terminal-manager/src/provider/mod.rs`                             |
| Anthropic    | `engine/houston-terminal-manager/src/provider/anthropic_classify.rs`              |
| OpenAI       | `engine/houston-terminal-manager/src/provider/openai_classify.rs`                 |
| Codex login  | `engine/houston-terminal-manager/src/provider/openai_login.rs` (login-flow diag)  |
| Gemini       | `engine/houston-terminal-manager/src/provider/gemini/classify.rs`                 |
| Stderr wire  | `engine/houston-terminal-manager/src/session_io.rs::read_stderr_lines`            |
| Result wire  | `engine/houston-terminal-manager/src/gemini_parser_state.rs::handle_result`       |
| Result wire  | `engine/houston-terminal-manager/src/codex_parser.rs::classify_codex_error_message` |
| Protocol     | `engine/houston-engine-protocol/src/lib.rs` (re-exports `ProviderError`)          |
| TS type      | `ui/chat/src/types.ts`                                                            |
| Card router  | `app/src/components/shell/provider-error-card.tsx`                                |
| Card pieces  | `app/src/components/shell/provider-error-cards/`                                  |
| i18n         | `app/src/locales/{en,es,pt}/shell.json` → `providerError.*`                       |

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
| `UsageLimitPaused`         | CLI is sleeping internally until the plan-window reset (today: Anthropic claude-code).  | None — non-terminal. Routines surface "Waiting · resumes at HH:MM" via `routine_run.paused_until`. |
| `ModelUnavailable`         | The requested model isn't available to this account (preview, deprecated, regioned).    | Switch to `suggested_fallback`, Pick another model.  |
| `Unauthenticated`          | Auth missing/expired/invalid. `cause` narrows the body copy.                            | Reconnect (drives `tauriProvider.launchLogin`).      |
| `NetworkUnreachable`       | Cannot reach the provider's API (DNS, connect refused, ECONNRESET).                     | Retry, Check status page.                            |
| `ProviderInternal`         | 5xx from upstream, transient infra failure.                                             | Retry, Check status page.                            |
| `SessionResumeMissing`     | Resume target doesn't exist (Codex `no rollout found`).                                 | Start fresh.                                         |
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
4. Add a `case` in `provider-error-card.tsx`'s dispatcher.
5. Update this doc's table.
6. Add the classifier(s) that produce the new variant.
7. `cargo test --workspace`, `pnpm tsc --noEmit`, `pnpm check-locales`,
   `pnpm vite build` — every gate green before committing.

## File map

| Layer        | Path                                                                              |
|--------------|-----------------------------------------------------------------------------------|
| Rust enum    | `engine/houston-terminal-manager/src/provider_error_kind.rs`                      |
| Trait        | `engine/houston-terminal-manager/src/provider/mod.rs`                             |
| Anthropic    | `engine/houston-terminal-manager/src/provider/anthropic_classify.rs`              |
| OpenAI       | `engine/houston-terminal-manager/src/provider/openai_classify.rs`                 |
| Gemini       | `engine/houston-terminal-manager/src/provider/gemini/classify.rs`                 |
| Stderr wire  | `engine/houston-terminal-manager/src/session_io.rs::read_stderr_lines`            |
| Result wire  | `engine/houston-terminal-manager/src/gemini_parser_state.rs::handle_result`       |
| Result wire  | `engine/houston-terminal-manager/src/codex_parser.rs::classify_codex_error_message` |
| Protocol     | `engine/houston-engine-protocol/src/lib.rs` (re-exports `ProviderError`)          |
| TS type      | `ui/chat/src/types.ts`                                                            |
| Card router  | `app/src/components/shell/provider-error-card.tsx`                                |
| Card pieces  | `app/src/components/shell/provider-error-cards/`                                  |
| i18n         | `app/src/locales/{en,es,pt}/shell.json` → `providerError.*`                       |

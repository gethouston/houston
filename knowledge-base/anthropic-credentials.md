# Anthropic credential lifecycle (Claude subscription OAuth)

Anthropic is the one provider whose turns run through the **Claude Agent SDK**
(a `claude` subprocess), not pi — so its credential plumbing is different from
every other provider. This file is the map. History: the July 2026 "Anthropic
is unusable" cluster (reconnect card after every send locally, cloud connect
timing out into the setup-token paste dialog, mid-session sign-outs) came from
the traps at the bottom — read them before touching any of this.

## Where the credential lives, per deployment

| Deployment | Source of truth | Who refreshes |
|---|---|---|
| Desktop (macOS) | Keychain item scoped to `<HOUSTON_HOME>/claude-login` (`claude auth login` writes it) | The SDK/CLI, in place |
| Desktop (Linux/Win) / self-host | `<HOUSTON_HOME>/claude-login/.credentials.json` | The SDK/CLI, in place |
| Managed cloud pod | Gateway Pg store (`/v1/pod/credentials`), captured at connect | The **gateway only** (single rotator; anthropic entry in `internal/credentials`, JSON grant) |
| Setup-token paste (any) | `auth.json` `api_key` entry (never expires) | Nobody |

## The flows

- **Desktop browser login** (`app/src-tauri/src/claude_login/`): spawns
  `claude auth login --claudeai` with `CLAUDE_CONFIG_DIR` pinned to the shared
  login dir and PIPED stdin. The CLI opens the browser and authorizes with
  `code=true` (redirect aimed at platform.claude.com — no localhost redirect):
  after the user approves, that callback page hands the authorization code to
  the CLI's random-port local listener automatically (the seamless path) OR,
  when that hand-off is blocked (firewalls, strict browsers; the common case on
  Windows — HOU-839), shows the user a code. That case recovers in stages so
  the happy path stays code-free: on app refocus a clipboard probe
  (`complete_claude_login_from_clipboard`) silently feeds a copied code-shaped
  string to the CLI's stdin; only when that finds nothing does the dialog
  surface a "Claude showed you a code?" link revealing a paste field
  (`submit_claude_login_code` → the CLI's `Paste code here if prompted >`
  readline). Either way the CLI caches the credential itself; there is NO deep
  link back to the app — the app watches the CLI's stdout/exit. The `visit:`
  URL line is OSC-8 hyperlink-wrapped by current CLIs; `resolve.rs` strips that
  before parsing.
- **Remote/cloud handoff** (`app/src/lib/claude-login-remote.ts`): after the
  local login, `read_claude_credential` (Rust) extracts the cached credential —
  file first, then the Keychain item `Claude Code-credentials-<sha256(dir)[:8]>`
  (the CLI scopes the service name by config dir; account = username) — and
  pushes it: host route `POST /agents/:id/credential/claude-oauth` → central
  store put (access + refresh) + materialize on the pod. Any failure degrades
  to the setup-token paste dialog (deliberate last resort; also the only path
  for a pure-web client, which has no local CLI).
- **Per-turn serve (managed cloud)**: the pod's serve sync
  (`packages/runtime/src/auth/serve.ts`) probes anthropic like every provider;
  the pod host serves a gateway-refreshed ACCESS-ONLY token
  (`routes/credential.ts`), the runtime writes it to `auth.json`
  (`refresh=""`), and the SDK consumes it via `CLAUDE_CODE_OAUTH_TOKEN`
  (`backends/claude/read-token.ts`). This is what survives pod recycles:
  `/data` is an emptyDir in prod and store-sync EXCLUDES both credential files.

## The five traps (each was a live bug)

1. **`USER` must reach the SDK subprocess.** The CLI names its Keychain
   *account* after the username; `buildClaudeEnv`'s allowlist passes
   `USER`/`LOGNAME`/`USERNAME` for exactly this. Scrub them and the SDK reads a
   different, empty Keychain item than the login wrote: connected in the UI,
   unauthenticated on every turn, unfixable by reconnecting.
2. **Never read the unsuffixed Keychain service.** `Claude Code-credentials`
   (no hash suffix) is the user's PERSONAL `~/.claude` credential. Pushing it
   to a pod makes the pod and the user's own Claude Code rotate one refresh
   token family and sign each other out mid-session.
3. **A served env token OUTRANKS the config-dir credential inside the SDK.**
   That's why serving anthropic is gated to `gatewayFronted` hosts and why a
   STALE anthropic token is never served best-effort (both in
   `packages/host/src/routes/credential.ts`) — a desktop host serving its
   stale durability-marker entry would shadow the working Keychain login.
4. **One refresh-token family = one rotator.** Anthropic rotates the refresh
   token on every use and invalidates the old one. The gateway is the single
   rotator for pods; the desktop CLI is the single rotator locally; the
   central-store copy on a desktop host is an inert marker (never served,
   never refreshed — TS `credentials/refresh.ts` deliberately has no anthropic
   entry).
5. **Windows: the CLI needs a shell BEFORE it does anything — even
   `auth login`.** At startup on Windows the CLI exits 1 unless it finds Git
   Bash or PowerShell (`pwsh` on PATH → three pwsh install dirs → plain
   `powershell` on PATH). Stock machines always have PowerShell 5.1 under
   `System32`, but mangled user PATHs made the probe miss (HOUSTON-APP-4YP,
   v0.5.20 launch day). And as a console binary spawned from a GUI app it
   pops a visible console window; the user closing it hangs up the child →
   exit 129 / SIGHUP (HOUSTON-APP-4YQ). Both spawn sites (login helper +
   engine sidecar) route through `app/src-tauri/src/shell_env.rs`, which sets
   `CLAUDE_CODE_GIT_BASH_PATH` when a Git for Windows bash exists, guarantees
   the built-in PowerShell dir on the child PATH, and the login spawn adds
   `CREATE_NO_WINDOW`. Never PATH-scan for `bash.exe` there —
   `System32\bash.exe` is WSL and wedges the CLI.

## "Connected" means USABLE, not present (all providers)

The status surface (`GET /providers` → the AI Models page + the chat model
picker; the frontend maps `configured` straight to authenticated/
unauthenticated) reports a provider connected only when its credential can
actually serve a turn:

- **auth.json entries** (`auth/storage.ts` `credentialUsable`): an API key is
  always usable (live-verified at connect); an OAuth entry with a refresh
  token is usable (pi refreshes it); an OAuth entry with refresh="" (the
  Gate #2 serve shape) is usable only until `expires`. A dead served token
  left behind by a control-plane outage no longer reads "Connected".
- **The materialized `.credentials.json`** (`backends/claude/
  credentials-file.ts` `claudeCredentialFileUsable`): judged by content, not
  existence — refresh token present, or unexpired access token. A stale file
  used to short-circuit `anthropicCredentialCached()` to connected even when
  the `claude auth status` probe correctly said logged-out.
- **Turn-failure feedback** (`auth/credential-health.ts`): a turn that fails
  `unauthenticated` marks the provider's CURRENT credential (by fingerprint)
  as broken — covering deaths invisible on disk (rotated-away refresh token,
  upstream revocation). The mark auto-heals when the credential changes and
  on the next clean turn. In-memory only.
- **Local model reachability** (`ai/endpoint-reachability.ts`): the
  OpenAI-compatible provider's status row additionally requires a cached
  `GET <baseUrl>/models` probe to succeed (TTL'd, warmed by `GET /providers`);
  a configured-but-stopped Ollama/LM Studio/Jan server reads disconnected.

The TURN path deliberately keeps looser gating (`providerConfigured`): a turn
on a suspect provider should run and surface its REAL typed card (network /
reconnect), and a clean turn is what heals a stale failure mark.

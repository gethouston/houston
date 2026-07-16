# Anthropic credential lifecycle (Claude subscription OAuth)

Anthropic is the one provider whose turns run through the **Claude Agent SDK**
(a `claude` subprocess), not pi — so its credential plumbing is different from
every other provider. This file is the map. History: the July 2026 "Anthropic
is unusable" cluster (reconnect card after every send locally, cloud connect
timing out into the setup-token paste dialog, mid-session sign-outs) came from
the four traps at the bottom — read them before touching any of this.

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
  login dir. The CLI opens the browser, catches its own loopback callback, and
  caches the credential itself. There is NO deep link back to the app — the app
  just watches the CLI's stdout/exit.
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

## The four traps (each was a live bug)

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

# Subscription OAuth credential lifecycle

Anthropic is the one provider whose turns run through the **Claude Agent SDK**
(a `claude` subprocess), not pi — so its credential plumbing is different from
every other provider. This file is the map. History: the July 2026 "Anthropic
is unusable" cluster (reconnect card after every send locally, cloud connect
timing out into the setup-token paste dialog, mid-session sign-outs) came from
the traps at the bottom — read them before touching any of this.

## OpenAI Codex OAuth rotation

OpenAI Codex refresh tokens rotate on use. In managed cloud the gateway is the
only rotator and central credential storage is authoritative; a pod may consume
only access tokens with `refresh=""`. Sharing one refresh-token family between
the gateway and a pod lets either side invalidate the other's copy.

Device-code connect is the narrow exception. pi first writes the complete new
credential into the pod's `auth.json`; the host then captures access + refresh
into central storage and immediately calls `POST /auth/scrub-refresh`. Capture
is successful only after that scrub succeeds, and both capture and scrub use
bounded retries. While this sequence is in flight, serve sync must preserve any
local OAuth entry with a non-empty refresh token. That entry is the newly minted
credential awaiting capture, whereas normal served entries are always
refresh-less and remain safe to replace on every serve cycle.

## Where the credential lives, per deployment

| Deployment | Source of truth | Who refreshes |
|---|---|---|
| Desktop (macOS) | Keychain item scoped to `<HOUSTON_HOME>/claude-login` (`claude auth login` writes it) | The SDK/CLI, in place |
| Desktop (Linux/Win) / self-host | `<HOUSTON_HOME>/claude-login/.credentials.json` | The SDK/CLI, in place |
| Managed cloud pod | Gateway Pg store (`/v1/pod/credentials`), captured at connect; pod materialization is access-only | The **gateway only** (single rotator; anthropic entry in `internal/credentials`, JSON grant) |
| Managed cloud pod, **personal** account (HOU-976) | Gateway Pg store keyed **(org, user, provider)**; served access-only per turn as `CLAUDE_CODE_OAUTH_TOKEN`, **never materialized to disk** | The **gateway only**, same single rotator, per row |
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
- **Remote/cloud handoff** (`app/src/lib/claude-login-remote.ts`): a
  remote-engine login mints into a THROWAWAY handoff dir
  (`<HOUSTON_HOME>/claude-login-handoff`, `start_claude_login` with
  `handoff: true`) — never the engine-shared dir. `read_claude_credential`
  (Rust) extracts it — file first, then the Keychain item
  `Claude Code-credentials-<sha256(dir)[:8]>` (the CLI scopes the service name
  by config dir; account = username) — and pushes it: host route
  `POST /agents/:id/credential/claude-oauth` → central store put
  (access + refresh) + materialize on the pod. **The desktop path names NO
  account** (HOU-976): `launchLogin(provider)` → `beginClaudeBrowserLogin` →
  `finishRemoteClaudeLogin` → `pushClaudeCredentialWithRetry`
  (`app/src/lib/claude-credential-push.ts`, the node-testable retry loop) →
  `pushClaudeOAuthCredential(json)`, and the setup-token paste FALLBACK is
  likewise scope-free. WHOSE row the push lands on is the gateway's call, derived
  from the space the request is made in: a team space has no shared AI account, so
  it is the acting member's own; a personal space has exactly one. A scope
  threaded down this path could only restate that or contradict it, which is why
  the URL is asserted WHOLE in `packages/web/tests/credential-write-urls.test.ts`
  — byte identity, so one cannot creep back as a query param, a path segment or a
  second query. Once the push settles the local copy is
  DESTROYED (`discard_claude_handoff_credential`): the gateway is that
  family's only rotator from then on. Every space the user connects mints its
  own family this way; there is deliberately NO path that seeds a space from a
  cached snapshot (the old `?if_absent=1` background reconcile did exactly
  that and was the HOU-950 root cause — the host still honors the flag for
  older clients, but nothing current sends it). A handoff failure surfaces as
  a standard ERROR (toast + Sentry), never the token paste dialog: the user's
  browser login succeeded, so a failed handoff is Houston's infrastructure
  failure (the 2026-08-15 broken-image incident dressed one up as "run
  `claude setup-token`" — `claude-login-settle.ts` `handoff-failed`). The
  paste dialog remains only where the browser login cannot run at all: the
  pre-AVX2 helper SIGILL fallback (`claude-login-failure.ts`) and the primary
  connect for a pure-web client (no local `claude` to run). Its copy is
  localized in the client and NEVER mentions a CLI — it points at an Anthropic
  Console API key (`app/tests/provider-login-cli-free-copy.test.ts` pins
  this; the runtime's wire `instructions` string is CLI-free too but new
  clients ignore its content).
- **Per-turn serve (managed cloud)**: the pod's serve sync
  (`packages/runtime/src/auth/serve.ts`) probes anthropic like every provider;
  the pod host serves a gateway-refreshed ACCESS-ONLY token
  (`routes/credential.ts`), the runtime writes it to `auth.json`
  (`refresh=""`), and the SDK consumes it via `CLAUDE_CODE_OAUTH_TOKEN`
  (`backends/claude/read-token.ts`). The connect-time
  `POST /auth/anthropic/oauth-credential` materialization is also access-only
  whenever serve mode is on, so the SDK can never rotate the gateway's refresh
  family from the pod. After serve sync, a pinned turn whose canonical provider
  is definitively not configured is refused with `unauthenticated /
  no_credentials` for that provider; reconnecting restores the credential and
  the app's normal unauthenticated auto-resume retries the undelivered prompt.
  Unpinned no-provider requests retain their `409 no_provider` contract. This is
  what survives pod recycles: `/data` is an emptyDir in prod, and no credential
  file syncs to the object store — but by two DIFFERENT mechanisms, which matters
  when you add one. `auth.json` and the entire `auth-users/` subtree are dropped
  **unconditionally** inside `excluded()` (`packages/runtime-client/src/
  object-sync/hydrate.ts`, matched by path suffix / segment) so no caller can
  configure the leak back in; `claude-login/.credentials.json` is merely a
  NAMED ENTRY in the caller-supplied list (`STORE_SYNC_EXCLUDES`,
  `packages/host/src/store-sync/daemon.ts`).

## Central refresh — the single-rotator rule, enforced in process

"One refresh-token family = one rotator" (trap #4 below) is the RULE;
`packages/host/src/credentials/refresh-coalescer.ts` is what enforces it INSIDE
one host. Every OAuth refresh now goes through the
process-wide `sharedCredentialRefresher` — both the serve route
(`routes/credential.ts`) and the turn path (`turn/fresh-credential.ts`, split out
of `start-turn.ts` precisely so it lands in the same flight; it brings its own
injected refresher rather than keeping a private rotator).

- **Single-flight + 30s result cache, keyed (workspace, SCOPE, provider)** — scope
  in the key so one member's rotation is never handed to another member's serve
  (HOU-976). One runtime process per agent serves per turn AND per `/providers`
  poll, so an expiring credential produced N simultaneous refreshes of the SAME
  refresh token; a rotating provider (openai-codex) answers the first and rejects
  the rest with `invalid_grant`, which the serve route read as "the session ended"
  and deleted the credential. The user watched their provider disconnect itself.
  The cache holds FULL credentials, so every write sweeps aged-out entries; a
  failure is never cached, and `forget()` drops one key after a disconnect
  (in-flight state is deliberately untouched — evicting a live flight would open a
  second concurrent exchange of the same rotating token).
- **The flight re-reads the credential inside the critical section** (`load`): a
  sibling host may have rotated it already, and serving that costs nothing while
  refreshing again would burn a rotated token. `null` there means the user
  disconnected mid-flight → `CredentialGoneError`, which the serve route answers
  with the marked 404 and the turn path reads as "no credential". A queued refresh
  can therefore never RESURRECT the row the user just deleted.

### What may sign a user out (`credentials/oauth-token-exchange.ts`)

One `grant_type=refresh_token` POST, 10s timeout, three failure classes — only
the first is destructive:

- **`RefreshRejectedError`** — a 400/401 whose body names `invalid_grant` or
  `refresh_token_invalidated` (both shapes parsed: RFC 6749's `{"error":"…"}` and
  OpenAI's nested `{"error":{"code":"…"}}`). Terminal: dead until the user
  reconnects. `invalid_client` is deliberately NOT terminal — it condemns
  Houston's ONE hardcoded public client id, not the user's token, so honoring it
  would delete every workspace's credential on its next refresh with no path back.
  An unparseable body yields no code and stays non-terminal.
- **`TransientRefreshError`** — the request provably never left this process
  (`ENOTFOUND` / `EAI_AGAIN` / `ECONNREFUSED` on the fetch's `cause`). The ONLY
  retryable class (`refreshCredential`, default 2 attempts, jittered 250-500ms).
  `ECONNRESET` is excluded: a reset can land after the grant was consumed.
- **plain `Error`** — timeout, abort, 5xx, 429, any other 4xx. One attempt, never
  retried: the endpoint may already have consumed the rotating refresh token and
  rotated it into a response we never read, so a second POST spends a grant we no
  longer hold and earns `invalid_grant` — signing the user out over a blip. The
  serve route serves the stored token best-effort and the next serve tries again.

### A rejected refresh deletes ONLY the token that was rejected

`credentials/disconnect.ts` `disconnectRejectedCredential` is the whole policy
behind the serve route's `RefreshRejectedError` branch. It calls
`credentials.removeIfAccess(...)` with the digest of the REJECTED access token
(`accessDigest` — the same "name the token, never ship it" rule the revoked-token
report follows), so a reconnect, or a sibling host's rotation, that landed in the
window between our read and the endpoint's verdict survives untouched. Dropped →
the marked 404 (`x-houston-not-connected`), the runtime removes its served entry
(provenance-gated) and the provider reads signed out; the credential IS the
switch. Not dropped → re-read the store and serve the SUPERSEDING credential
through the route's remaining checks (anthropic staleness included). A re-read
answering the same digest is confirmation, not supersession — `RemoteCredentialStore`
serves `get` from a short-lived cache — and still ends in the marked 404. Either
way the coalescer's cached result for that key is forgotten, and a failure of the
re-read itself degrades to "absent" rather than escaping as a 500 in place of the
404 the runtime knows how to act on.

### A provider-revoked credential must STAY deleted — the revocation tombstone

The revoked-token report deleting the central row is only half the job; Sentry
HOUSTON-APP-530 (734 events / 380 users in two weeks) was the other half:
everything that put the dead credential BACK. Old pre-HOU-950 desktop builds
still loop the cached-snapshot reconcile (`?if_absent=1` claude-oauth push) on a
15–30s cadence, and the pod itself could refill via the legacy-fallback adoption
(`credentials/remote-store.ts`) or the serve healer. Every refill of a revoked
family fails the next turn, which reports, which deletes, which invites the next
refill — one turn burned and one Sentry error per cycle, forever.

`credentials/revocation-tombstones.ts` breaks the cycle: a CONFIRMED removal
(`removed:true` on `/sandbox/credential/revoked`) tombstones that
(workspace, scope, provider) for 15 minutes, and every AUTOMATIC refill path
consults it — the `ifAbsent` claude-oauth fill answers 409, fallback adoption
and the healer skip. Deliberately scope-blunt, not digest-scoped: a cached
snapshot of the revoked family carries a DIFFERENT access token than the one
the report named (the gateway rotated the family since), so a digest tombstone
would block nothing. USER-driven connects are never blocked and CLEAR the
tombstone (overwrite claude-oauth push, verified api-key/setup-token paste,
device-code capture); the TTL bounds any clear-site we missed. Logging split
accordingly: a confirmed removal is the pipeline WORKING (the user gets the
reconnect card) and logs info; the error-level line — the only one Sentry
should page on — is a SECOND confirmed removal inside the tombstone window,
which means something (a stale client, a path that bypasses the pod host)
resurrected a dead credential past the guards. The ledger is per-pod-process
and in-memory: a pod restart forgives it, costing at most one extra cycle.

## The six traps (each was a live bug, or a guarded near-miss)

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
   token on every use and invalidates the old one; REUSING a stale one revokes
   the whole family, signing the user out everywhere. The gateway is the
   single rotator for pods; the desktop CLI is the single rotator locally; the
   central-store copy on a desktop host is an inert marker (never served,
   never refreshed — TS `credentials/refresh.ts` deliberately has no anthropic
   entry). A serve-mode pod therefore strips the refresh token from both its
   served `auth.json` entry and its connect-time materialized Claude credential;
   only desktop/self-host materialization retains the full credential for local
   SDK refresh. HOU-950 corollary: a family must never be COPIED between rotating
   stores — a remote login mints in the handoff dir and the local copy dies
   after the push (exclusive handoff), and cached snapshots are never pushed.
   No locking or freshness check makes a shared family safe; the invalidation
   happens at Anthropic. Separate spaces get separate families (Anthropic
   allows many concurrent families per account). Inside a single host the rule
   is enforced by the coalescer — see "Central refresh" above.
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
6. **A PERSONAL anthropic family must never reach — or be READ FROM — the shared
   claude-login dir** (HOU-976). One pod serves every member of a team space, and
   `<HOUSTON_HOME>/claude-login/.credentials.json` is pod-wide: it is the TEAM's
   credential — meaning the workspace-level one the no-acting-identity `"team"`
   scope addresses, not an account a team space offers its members (it offers
   none; each member's turns run on their own). So nothing legitimately routes a
   member's turn there, and every path that could is guarded. Both directions
   are, and the read side has three moments, not one.

   **WRITE.** Materializing a member's family there would (a) leak their
   credential to every other member of that space and (b) create a SECOND rotator
   beside the gateway, which is trap #4 with a shared file instead of a shared
   copy. So `packages/runtime/src/backends/claude/credentials-file.ts`
   hard-refuses to write when the acting scope is personal (guarded + tested).

   **READ.** Three separate moments could authenticate a personal turn as the
   team; all three live in `backends/claude/`:
   - *Session creation* with no personal token → `scope-guard.ts`
     `assertAnthropicScopeCredential` refuses, on the turn path AND the one-shot
     path (titles, anonymize). Its message must keep the `No provider connected.`
     prefix — that sentinel is what renders the typed reconnect card.
   - *Mid-turn 401* → `scope-guard.ts` `anthropicCredentialStorageDir`. The
     personal token is served ACCESS-ONLY, so it can die while the turn is still
     running, and the Claude CLI then runs its OWN recovery: it re-reads its
     credential store — `<dir>/.credentials.json`, or the dir-scoped macOS
     Keychain item — and adopts whatever access token is there. Pointed at the
     shared dir that is the team's, adopted with no error and no card. **The SDK's
     `getOAuthToken` callback does NOT close this** (verified against the Claude
     Code build the pinned SDK spawns, 2.1.201 / `@anthropic-ai/claude-agent-sdk`
     0.3.201): the CLI only registers it when `CLAUDE_CODE_ENTRYPOINT` is
     `claude-desktop` / `local-agent` / `claude-vscode` and the SDK pins ours to
     `sdk-ts`; it is skipped whenever the stored credential has a refresh token;
     and even when it runs it only PRECEDES the disk read, so a null return falls
     straight through (`tengu_oauth_401_recovered_from_disk`). The lever is the
     store's LOCATION: for a personal scope we set
     `CLAUDE_SECURESTORAGE_CONFIG_DIR` to `<dataDir>/auth-users/<hash>.claude-storage`,
     which relocates the CLI's credential store (the file AND the Keychain service
     name, which is hashed from that dir) and **nothing else** —
     `CLAUDE_CONFIG_DIR` keeps owning the `projects/` transcript tree, so resume,
     the sessions store and cross-member conversation continuity are untouched.
     Recovery then finds nothing, the 401 stands, and the member gets the honest
     auth card. Team / desktop / self-host set no override at all, so that env is
     byte-identical. Re-verify this seam on an SDK bump: it is the CLI's own
     mechanism, but it is not part of the SDK's typed `Options`.
   - *The "connected" status surface* → `credential-status.ts`
     `anthropicCredentialCached()` returns false under a personal scope, so a
     member is never shown connected on a credential that is not theirs.

   A personal anthropic turn is served access-only via `CLAUDE_CODE_OAUTH_TOKEN`,
   which outranks the config-dir credential anyway (trap #3). The runtime's
   per-identity credential material lives under `<dataDir>/auth-users/` — the auth
   file, its served-providers manifest, and the `.claude-storage` dir above. That
   whole subtree is dropped from store-sync **unconditionally** by `excluded()`
   (NOT via the configurable list, which is what carries
   `claude-login/.credentials.json` — see "Per-turn serve" above) and is denied to
   the agent's own file tools by `session/tools/fs-guard.ts`.

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

On a managed engine pod, an authoritative central serve miss (the gateway's
marked not-connected response or a dead-credential response) also self-heals
from a full refresh-bearing credential still owned by that same pod runtime.
The host single-flights and cools down recovery per provider, reuses the normal
export → gateway PUT → runtime scrub transaction, then re-reads and serves the
gateway-verified access token in the same request. A successful scrub leaves
the pod access-only and restores the gateway as the credential family's single
refresh-token rotator; transport failures never trigger an upload.

### The anthropic probe: unanswerable is NOT signed out

macOS caches the browser login in the Keychain (nothing to stat), so the only
cross-platform "is anthropic connected?" signal is asking the binary:
`claude auth status --json`, scoped to the shared login dir with the ambient
credential env scrubbed (`packages/runtime/src/backends/claude/auth-cli.ts` —
subprocess mechanics live there so `credential-status.ts` stays pure cache
policy). A subprocess can fail to ANSWER, and reading that as "logged out" is what
flapped a signed-in user's chat to "Connect Anthropic" mid-session. So the probe
is three-valued: `{known: true, loggedIn}` ONLY when stdout parses as JSON with a
boolean `loggedIn`; a killed/timed-out child, empty stdout, non-JSON, or an
unrecognized shape is `{known: false, reason}`. A non-zero exit is NOT itself a
failure — `claude auth status` exits non-zero while printing a valid
`{"loggedIn": false}`. Only ENOENT (no binary at all) rejects.

`credential-status.ts` then treats an unknown answer as no answer: the cache keeps
its LAST KNOWN value, the concrete reason is logged, and a 15s respawn backoff
stops the `/providers` poll cadence spawning a subprocess per request. That branch
deliberately does NOT stamp the TTL clock — the clock times how fresh the cached
ANSWER is, and stamping it made the two knobs stack (after the backoff expired the
30s connected TTL kept blocking, freezing status for 30s instead of the 15s the
backoff promises). TTLs are asymmetric on purpose: connected 30s (stable — our own
login/logout routes force a refresh), disconnected 2s (must flip within a poll
cycle of the user signing in). `force` bypasses both TTL and backoff, and
concurrent callers share one in-flight subprocess.

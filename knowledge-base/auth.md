# Auth (Supabase + Google SSO)

One-click Google sign-in on first launch. CI release tokens live in macOS Keychain / Windows Credential Manager, never localStorage or disk. Local builds use browser storage scoped per worktree to avoid macOS Keychain prompts from changing local signatures. Identifies users in PostHog, lays the foundation for Houston Cloud.

## The flow (PKCE)

1. User clicks **Continue with Google** in `SignInScreen`.
2. Frontend calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "houston://auth-callback", skipBrowserRedirect: true } })`.
3. Supabase generates a PKCE code_verifier, writes it to the configured auth storage adapter, returns an auth URL.
4. Frontend opens the URL in the user's system browser via `tauriSystem.openUrl()`.
5. User completes Google consent.
6. Google redirects to Supabase → Supabase redirects to `houston://auth-callback?code=<code>`.
7. macOS delivers the URL to the running Houston via `tauri-plugin-deep-link`.
8. Rust handler in `app/src-tauri/src/auth.rs::emit_deep_link` forwards the URL on a Tauri event (`auth://deep-link`).
9. Frontend listener in `app/src/lib/auth.ts::installDeepLinkListener` extracts `code`, calls `supabase.auth.exchangeCodeForSession(code)` — Supabase reads the verifier from configured auth storage, exchanges, writes the session back.
10. `supabase.auth.onAuthStateChange` fires → `useSession()` re-queries → `App.tsx` dismisses `SignInScreen` → sidebar footer `UserMenu` + Settings → Account section appear.
11. PostHog: `analytics.alias(userId, { email, name })` merges the anonymous `install_id` history into the identified user.

## Web / Cloud (same components, browser flow)

The cloud web build (`packages/web`, cloud mode) reuses the SAME native auth UI —
`SignInScreen` for sign-in and the sidebar `UserMenu` for the signed-in account.
Don't build bespoke login UIs for new surfaces; configure the app's own Supabase
client instead (bake `SUPABASE_URL`/`SUPABASE_ANON_KEY` at build time) and the
native components activate. Platform differences are `isTauri()`-guarded:

- **Desktop**: system browser + `houston://` deep link + manual
  `exchangeCodeForSession` (steps above); `detectSessionInUrl: false`.
- **Web**: a normal in-page redirect to `${origin}/auth/callback`;
  `detectSessionInUrl: true` lets supabase-js consume the `?code=` on load.
  Storage is localStorage (no Keychain in a browser).

**Gotcha that bit us live:** every web origin must be in Supabase
**Authentication → URL Configuration → Redirect URLs** (e.g.
`https://<cloud-run-host>/**`). When `redirectTo` isn't allow-listed, Supabase
silently falls back to the project Site URL — which is the DESKTOP bridge at
`gethouston.ai/auth/callback`, so browser users get bounced into the desktop
app. The Site URL must stay the desktop bridge; add web origins to the
allow-list instead.

In cloud mode the Supabase access token doubles as the control-plane bearer:
`CloudApp` (packages/web/src/cloud-login.tsx) mirrors the live session token
into `window.__HOUSTON_ENGINE__`, and the engine adapter reads it per request
(`control-plane.liveToken`) so silent refreshes are picked up without a reload.

## Desktop hosted mode + the OAuth toggle (HOU-611)

The desktop app talks to the managed cloud gateway when `VITE_HOSTED_ENGINE_URL`
is set. There the bearer is the **Supabase session token**, not a static key:
`EngineGate` (`app/src/components/shell/engine-gate.tsx`) routes to
`HostedEngineGate`, which blocks the app behind `SignInScreen` until Google
sign-in lands, then feeds the session token to the engine client via
`setHostedEngineSessionToken` (`app/src/lib/engine.ts`). The gateway verifies
that JWT (`gethouston/cloud`, `src/auth/verify-supabase.ts`) and swaps in the
pod's internal token — the user JWT never reaches the pod.

Whether that OAuth gate runs is the **`VITE_HOSTED_ENGINE_AUTH`** switch
(`hostedAuthMode` / `hostedOauthLoginActive` in `app/src/lib/engine-mode.ts`):

| `VITE_HOSTED_ENGINE_AUTH` | Behavior |
|---|---|
| unset (hosted URL set) | **`oauth`** — Google login required (the managed-cloud default; unchanged contract) |
| `oauth` / `supabase` / `google` / `1` / `true` / `on` | Google login required |
| `static` / `token` / `none` / `0` / `false` / `off` | No login — point at the hosted URL with the static bearer (`VITE_HOSTED_ENGINE_TOKEN` / `VITE_NEW_ENGINE_TOKEN`), exactly like `VITE_NEW_ENGINE_URL`. For service-token smoke tests. |

Hosted OAuth needs a baked Supabase project (`SUPABASE_URL` + `SUPABASE_ANON_KEY`).
A build that turns OAuth on without them can never obtain a token, so the gate
renders a loud **"Sign-in required"** screen (`shell:engineGate.authRequired*`)
instead of spinning on the start splash forever.

`static` suppresses only this hosted-engine OAuth gate. If a build separately
bakes Supabase, the app-wide sign-in (`App.tsx`'s `isAuthConfigured()` gate) still
applies, so the no-login path is meant for service-token smoke builds that bake no
Supabase creds.

**Shipping a cloud desktop build.** The signed, all-platform CI for this mode is
the `cloud-v*` channel of `.github/workflows/release.yml`: tag `cloud-v<version>`
and it builds mac/win/linux with `VITE_HOSTED_ENGINE_URL` baked from the
`HOSTED_ENGINE_URL` **secret** (the gateway URL is never a literal) plus
`VITE_HOSTED_ENGINE_AUTH=oauth`, so users just sign in with Google — no URL to
enter. The plain `v*` channel is the unchanged local build. See
`convergence/README.md` → "Host-sidecar release CI" for the channel details and
the updater-isolation note.

### Testing Google login against the local kind gateway

To exercise the real Google-login flow against the `gethouston/cloud` local kind
gateway (`cloud/k8s/kind`) with the desktop app as client:

1. Bake the Supabase project into the dev build — in `app/.env.local`:
   ```
   SUPABASE_URL=https://zfpnlvxazrataiannvtq.supabase.co
   SUPABASE_ANON_KEY=<anon public key>
   VITE_HOSTED_ENGINE_URL=http://localhost:9080
   # VITE_HOSTED_ENGINE_AUTH defaults to oauth when the hosted URL is set;
   # set it to `static` (+ VITE_HOSTED_ENGINE_TOKEN=<service token>) to test
   # the no-login path instead.
   ```
2. Bring the gateway up: `make kind-up` in the cloud repo. Its
   `ServiceTokenVerifier` falls through to the real `SupabaseTokenVerifier`
   (kind sets `GW_SUPABASE_JWKS_URL`), so a Google-issued JWT verifies with no
   gateway change.
3. `pnpm tauri dev` in `app/` → **Continue with Google** → the verified session
   token reaches the gateway, which provisions your per-user pod.

## Runtime engine-connection chooser (HOU-621)

The hosted mode above is baked at **build** time. HOU-621 adds a **runtime** pick
for the TS-engine build so one binary can go either way. It only appears in the
TS-engine build (`VITE_NEW_ENGINE=1`, the build where `vite.config.ts`'s `useHost`
aliases the v3 adapter) **and** when no URL is baked (`VITE_HOSTED_ENGINE_URL` /
`VITE_NEW_ENGINE_URL` still win and skip the chooser). The plain Rust build (no
flags) never sees it — `resolveEngine` returns `sidecar` and `ConnectionGate` is a
passthrough.

Flow (`app/src/components/auth/connection-chooser.tsx`, gated by
`ConnectionGate` above `EngineGate` in `main.tsx`):

- **Use this computer** → persists `{mode:"local"}` → runs the Tauri host sidecar
  (the normal handshake). Account sign-in is the standard `SignInScreen`; the
  manual-paste box shows only in **dev** builds (the #146 deep-link-collision
  fallback), never in production standalone.
- **Connect to a remote engine** → prompts for a URL (`normalizeEngineUrl`
  accepts a bare host and prepends `https://`, e.g. `engine.example.com`) →
  persists `{mode:"remote", url}` → reload → treated exactly like an
  OAuth-hosted gateway: `HostedEngineGate` + `SignInScreen` **with** the
  paste-the-code fallback (`allowManualCallback`), and the Supabase session token
  becomes the gateway bearer. The allowlist is enforced server-side (the gateway
  401s a non-allowlisted JWT). **Provider (Codex/OpenAI) OAuth against a remote
  DESKTOP no longer forces device-code** (the claim this section used to make):
  the desktop binds its OWN local `127.0.0.1:1455` loopback relay and finishes
  ChatGPT sign-in with zero code (PR #648) — pi's own 1455 lives in the pod, so
  there is no collision. Only a WEB (non-Tauri) remote client falls back to
  device-code. Full topology + rationale: **"Provider connect + turn execution
  (TS engine)"** below.

The choice lives in `localStorage` (`houston.engineConnection`,
`app/src/lib/engine-connection.ts`) and is read **synchronously** at
`engine.ts` module load — so applying one reloads the webview to re-run that
module deterministically (the HOU-546 "engine mode is a build-time constant"
invariant). Because the TS-engine build's Tauri shell still spawns a local
sidecar (`lib.rs` `host_mode` only checks the URL envs) and `window.eval`-injects
`window.__HOUSTON_ENGINE__`, `resolveConfig()` returns `null` for the remote
(`HOSTED_OAUTH`) path so the remote client is built **only** from the session
token and never adopts the idle local sidecar.

**Sign out returns to the chooser**: `signOut()` clears the stored choice and
reloads (only when a choice existed, so the Rust build is unaffected).

## Keychain boundary

| Piece | Where |
|---|---|
| Session JSON (access_token, refresh_token, user) | CI releases: Keychain entry `com.houston.app.auth` / `houston-auth` |
| PKCE code verifier | CI releases: Keychain entry `com.houston.app.auth` / `sb-…-auth-token-code-verifier` (Supabase-managed key) |
| Storage adapter | CI releases: `app/src/lib/supabase.ts::keychainStorage` → Tauri commands `auth_get_item` / `auth_set_item` / `auth_remove_item` in `auth.rs` |
| Local storage | Browser storage with worktree-scoped key `houston-auth-local-<hash>` |
| Rust dep | `keyring = "3"` with `apple-native` + `windows-native` features |

CI releases never touch localStorage. If Keychain is locked or unavailable, the in-memory session on the current run still works; nothing persists across launches. Degraded mode, not failure.

Local builds are different on purpose: Supabase uses browser storage with a worktree-scoped key (`houston-auth-local-<hash>`) and the Rust startup path does not read the persisted Keychain user id. macOS can treat every rebuild or worktree as a different app for Keychain access and show repeated password prompts. CI builds keep Keychain storage. Override with `HOUSTON_AUTH_STORAGE=keychain` or `HOUSTON_AUTH_STORAGE=browser`.

## Gating + offline behavior

- `isAuthConfigured()` (true when `SUPABASE_URL` + `SUPABASE_ANON_KEY` baked in) is the master switch. Unconfigured builds skip auth entirely — useful for local dev without secrets.
- `App.tsx` shows a splash while `useSession()` is loading, `SignInScreen` once the session resolves to `null`, the app otherwise.
- `supabase.auth.getSession()` reads local auth storage (CI-release Keychain, local browser storage) — transient Supabase blips do NOT kick the user. Silent token refresh handles token TTL under the hood.
- Hard sign-out: `signOut()` in `app/src/lib/auth.ts` clears the configured Supabase session storage and calls `analytics.reset()` so subsequent anonymous events don't attach to the prior user.

## PostHog integration

- Anonymous launch: `distinct_id = install_id` (minted in `install-id.ts`).
- Sign-in: `analytics.alias(userId, { email, name })` — merges the pre-signup history to the identified user.
- Sign-out: `analytics.reset()` — future events use a fresh anonymous `distinct_id`.

## Engine identity plumbing

- At engine spawn (`app/src-tauri/src/lib.rs`), CI-release builds read the persisted Supabase session from Keychain and pass `HOUSTON_APP_USER_ID` as an env var to the subprocess. Local builds skip this Keychain read. Engine treats the value as an opaque string.
- The env var is only set when the user was already signed in on a prior launch and the build uses Keychain auth storage. First-run signed-in users don't get the env var until the next app restart — engine doesn't need it yet; server-side use is future work.
- `HoustonEvent` envelope does NOT carry `user_id` today — deferred until there's a server-side consumer that needs it. When that lands, wrap `HoustonEvent` in an envelope struct in `engine/houston-ui-events` rather than adding `user_id` to each variant.

## Required secrets

| Var | Source | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase project settings → Project URL | Public; baked into the bundle at build time via Vite `define` |
| `SUPABASE_ANON_KEY` | Supabase project settings → Project API keys → `anon` `public` | Public by design; RLS policies gate all data access |

Also in CI as GitHub Secrets.

## One-time GCP setup (human)

1. GCP Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
2. Type: Web application
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (from Supabase → Auth → Google → Callback URL)
4. Copy client_id + client_secret → Supabase → Authentication → Providers → Google → paste + enable

## One-time Supabase setup (via Supabase MCP)

Minimal schema + trigger to auto-create a `profiles` row on user signup:

```sql
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "update own profile" on public.profiles for update using (auth.uid() = user_id);

create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (user_id, email, name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar_url');
  return new;
end; $$ language plpgsql security definer;

create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## What's deliberately out of scope

- Apple SSO, email magic-link, phone OTP. Surface a "More sign-in options coming soon" microcopy line today; add providers later in Supabase dashboard.
- Server-side Rust emitting PostHog events directly — frontend covers Houston's event surface.
- Houston Cloud API endpoints — this is the identity foundation, not the product surface.
- Mobile (Capacitor) — Supabase JS works there too; deep-link scheme registered separately per platform.
- In-app NPS — PostHog has it built in; configure later.
- Teams / orgs, Stripe billing — future Supabase schema extensions.

## Provider connect + turn execution (TS engine) — CURRENT

This is the CURRENT provider-auth model (pi runtime + host, PRs #636 / #647 /
#648). It REPLACES the Rust-engine "Provider CLI re-auth" section below, which is
retired. There are no provider CLIs — pi talks to providers in-process — with ONE
exception: Anthropic, which runs through the Claude Agent SDK for compliance (see
below). Cross-ref: `convergence/README.md` → Standing decisions → "Anthropic in
cloud" (packaging) and the backend seam.

### Per-provider turn execution — the `HarnessBackend` seam

Turn execution is pluggable per provider behind `HarnessBackend`
(`packages/runtime/src/backends/types.ts` + `registry.ts`). Both the long-lived
server (`session/`) and the per-request cloud runtime (`turn/`) drive turns
through this port; the emitted wire dialect (`WireEvent`) is identical whatever
backend runs.

- **pi is the default backend** (`backends/pi/`): `setDefaultBackend(pi)`, and any
  provider without a specific registration resolves to it via
  `backendFor(providerId)` (throws if neither a registration nor a default exists
  — a turn never silently runs on no backend).
- **`anthropic` registers the Claude Agent SDK backend** (`backends/claude/`):
  `registerBackend("anthropic", claudeBackend)`, so Anthropic turns run the real
  `claude` subprocess (`@anthropic-ai/claude-agent-sdk`) instead of pi's
  in-process Anthropic client.

**Why the SDK for Anthropic.** Anthropic server-blocks raw subscription-OAuth
replay (harness-spoofing) since 2026-04. The sanctioned way to use a Claude
Pro/Max subscription programmatically is to run Anthropic's OWN harness — the
Claude Agent SDK, which spawns their native `claude` binary. So Houston runs it
rather than replaying OAuth against Anthropic's API itself.

**Compliance rule (load-bearing):** when the active provider is `anthropic`, BOTH
turns AND conversation titles go through the SDK subprocess — NEVER pi's
in-process Anthropic client. Turns: `backends/claude/backend.ts` → `ClaudeSession`
(`session.ts`, `translate.ts` maps SDK messages → `WireEvent`s). Titles:
`backends/claude/title.ts` (`titleWithClaude`) is a one-shot SDK query, NOT pi's
in-process summarizer — a title leaking to the in-process client would be the
exact replay Anthropic blocks. `title.ts` and `backend.ts` share `tokenEnv` so
the two paths set the identical auth env var.

How the SDK subprocess runs (`backend.ts`):
- **Token in `options.env`** — `CLAUDE_CODE_OAUTH_TOKEN` for a `sk-ant-oat01…`
  setup token, `ANTHROPIC_API_KEY` for a `sk-ant-api03…` console key (`tokenEnv`
  + `read-token.ts`, selected by prefix). `options.env` REPLACES the child env, so
  `process.env` is spread in to keep PATH/HOME while pinning the config dir + token.
- **Isolated `CLAUDE_CONFIG_DIR`** under the agent `dataDir` + `settingSources: []`
  — nothing on the host machine's `~/.claude` leaks in.
- **Workspace-clamp `canUseTool`** (`tool-policy.ts`): pi's clamped toolset
  (Read/Edit/Write/Glob/Grep, plus Bash only when code execution is local) mirrored
  as the SDK `tools` allowlist + a `disallowedTools` deny of the Claude Code tools
  pi lacks; every call routes through a `WorkspaceGuard`-backed handler that
  auto-approves in-workspace targets and denies escapes. There is deliberately NO
  `allowedTools` — an allow rule short-circuits `canUseTool` and would bypass the
  clamp.
- **SDK is an OPTIONAL dep**, lazily imported inside `createSession`/`titleWithClaude`;
  its absence throws typed `ClaudeBackendUnavailableError`, never crashes the runtime.
- **Binary resolution** (`binary-path.ts`): on Node (self-host / engine-pod /
  per-turn Docker / dev / tests) the SDK self-resolves its ~250 MB per-platform
  native binary via `require.resolve`; inside the Bun-compiled desktop sidecar
  `require.resolve` can't reach `$bunfs`, so `resolveClaudeExecutable` points the
  SDK at the `<dir of sidecar>/claude` sibling via `pathToClaudeCodeExecutable`.
  Which images carry vs strip the ~250 MB binary (and the deferred desktop
  externalBin wiring) is in `convergence/README.md`.

**Cloud per-turn keeps Anthropic OFF** (ToS). The multi-tenant per-turn Cloud Run
image strips the `claude` binary and the catalog doesn't advertise `anthropic`;
only local + self-host + the managed single-tenant pod run it. Config asymmetry,
not a code fork.

### Anthropic connect UX — the setup-token PASTE flow

`auth/anthropic-setup-token.ts` + `auth/login.ts`. Replaces the deleted
`anthropic-headless` direct-OAuth flow.

**What the user does:** runs `claude setup-token` in their own terminal (it mints
a long-lived `sk-ant-oat01…` token) and PASTES that token into Houston. A console
`sk-ant-api03…` API key works too. Houston never replays OAuth itself (the blocked
path) and never spawns the `claude` binary for login (it is an Ink TUI that needs
a real TTY and deadlocks on the runtime's piped stdio).

**Wire shape is unchanged:** `startLogin("anthropic")` emits the same
`{ kind:"auth_code", url, instructions }` LoginInfo and reuses `completeLogin`'s
paste promise, so the existing connect UX (`connect.tsx` /
`provider-login-dialog.tsx`) works verbatim — the pasted value is a token, not an
OAuth code. `url` is Anthropic's CLI-reference help page, shown next to the paste
box.

**What's stored + why the shape matters:** the token is persisted under
`"anthropic"` as pi's **`api_key`** PiCred variant
(`authStorage.set("anthropic", { type:"api_key", key })`). Because an api_key
credential has no refresh token, the central refresh path (`refresh.ts`) and the
credential-scrub gate stay a NO-OP for anthropic — untouched. pi-ai's anthropic
provider auto-detects the `sk-ant-oat` prefix and switches to Bearer + Claude Code
identity headers; an `sk-ant-api03…` key routes to the standard `x-api-key` path.
`read-token.ts` reads the same stored value back for the SDK backend, again
selecting the env var by prefix (no-silent-failure: a wrong variant or unknown
prefix returns undefined AND logs the reason).

### OpenAI / Codex (ChatGPT) login topology — truth table (as shipped)

Codex OAuth has two flows: the **browser/loopback** login (approve in your own
browser, no code) and the **device-code** grant (type a one-time code while the
runtime polls). Which runs is decided by the CLIENT'S topology, because the
loopback callback lands on `127.0.0.1:1455` — whoever binds that port must be
co-located with the user's browser. `tauri.ts::launchLogin` resolves the
`deviceAuth` flag centrally so every entry point (picker, settings, reconnect
card, banner) agrees.

| Client topology | Flow | Who owns the 1455 loopback |
|---|---|---|
| **Local sidecar** (co-located desktop) OR **loopback dev URL** (`VITE_NEW_ENGINE_URL` at 127.0.0.1/localhost) | pi's own browser login (`deviceAuth:false`); client just opens the authorize URL | **pi, in-process** — zero app code |
| **Remote DESKTOP** (`VITE_HOSTED_ENGINE_URL`, or a non-loopback `VITE_NEW_ENGINE_URL`) | zero-code browser login via the desktop **1455 relay** (`launchLogin` forces `deviceAuth:false` for `openai` here) | **the desktop app** binds its OWN local 1455 and relays the callback code — pi's 1455 is in the pod |
| **Web** (non-Tauri) | device-code — verification URL + one-time `user_code`, runtime polls | nobody (no local browser reachable) |

- **Frontend gates** (`app/src/lib/engine-mode.ts`):
  `providerLoginUsesDeviceAuthByDefault` is the topology default for the
  `deviceAuth` a client sends (co-located desktop → `false`; remote desktop / web
  → `true`). `codexUsesLoopbackRelay` = `isTauri && device-auth-by-default`, i.e.
  the relay is **desktop-remote ONLY**. For `openai` in that case
  `launchLogin` OVERRIDES `deviceAuth` back to `false` so the runtime emits an
  authorize URL (not a device code), then `shouldUseCodexLoopback`
  (`provider-login-url.ts`, requires `provider==="openai"` + no `userCode`) routes
  it to the relay. The relay itself is `app/src/lib/codex-loopback.ts`
  (`beginCodexBrowserLogin`: bind the native loopback, open the URL, relay
  `code=…&state=…` to the engine via `submitLoginCode`).
- **Runtime side** (`auth/login.ts`): `codexLoginMethod` picks browser vs
  device-code purely from `deviceAuth`. The browser method works even against a
  remote runtime because pi races its own local callback server against a
  manually-relayed code — the desktop catches the fixed
  `http://localhost:1455/auth/callback` redirect and relays code+state, and the
  runtime does the token exchange, so its own loopback never needs to be reachable.

**History (#615 → #620 → #648).** #453/#615 first dropped `ProviderLoginUrl` when
`osIsTauri()` and left codex's `localhost:1455` fallback alone; the sharp edge is
that a CO-LOCATED desktop that binds 1455 fights pi, which already owns it there.
#648 gates the desktop 1455 relay REMOTE-ONLY (`codexUsesLoopbackRelay`) precisely
to dodge that LOCAL 1455 collision: only when pi's 1455 is elsewhere (in the pod)
does the desktop bind its own. Co-located desktop and loopback dev URLs keep pi's
in-process flow untouched.

## Provider CLI re-auth (Claude Code / Codex) — [LEGACY, Rust engine — RETIRED]

_This is the legacy Rust-engine CLI-subprocess path. The TS engine's provider
model is **"Provider connect + turn execution (TS engine)"** above — in-process
OAuth for OpenAI/Codex, the Claude Agent SDK for Anthropic, and pasted API keys
for the rest. The sections below survive only to explain the retired build._

Separate from Houston account auth. Claude Code and Codex keep their own CLI
sessions. When those sessions expire mid-chat, `houston-terminal-manager`
classifies auth-shaped stderr/stdout (`401`, `unauthorized`, `not authenticated`,
expired OAuth/API-key messages) and `houston-agents-conversations` emits
`HoustonEvent::AuthRequired`. Desktop listens in `use-session-events.ts`, sets
`authRequired`, and `ProviderReconnectCard` renders inside chat via
`ChatPanel.afterMessages`. The card opens `claude auth login --claudeai` or
`codex login` through `/v1/providers/:name/login` and polls provider status
until the CLI reports authenticated.

**`ProviderLoginDialog` is a remote-only affordance.** On desktop the engine
is the co-located sidecar: the provider CLI opens the user's own browser and
finishes through its `localhost` OAuth callback, so the connect surfaces
(`ProviderPicker`, and the AI Hub's provider cards via the
`useProviderConnections` hook — `app/src/hooks/use-provider-connections.ts` +
`components/ai-hub`) **drop `ProviderLoginUrl` when
`osIsTauri()`** and show no dialog — they just wait for `ProviderLoginComplete`
to flip the card (issue #453). Without that guard claude (which prints its
`https://claude.com/…` URL unconditionally) flashed a paste-back dialog that
instantly auto-dismissed; codex never did, because its desktop fallback URL is
`http://localhost:1455/…`, which the relay's `https://`-only regex skips. The
engine still emits `ProviderLoginUrl` either way — it's frontend-agnostic; the
client decides whether it can reach a local browser.

**Headless connect uses two completion shapes.** A remote client (browser
webapp, or the desktop app pointed at `VITE_NEW_ENGINE_URL` /
`VITE_HOSTED_ENGINE_URL`) can't receive the runtime's `localhost` OAuth
callback. The shared app adapter defaults `deviceAuth` through
`providerLoginUsesDeviceAuthByDefault`: co-located desktop (Rust sidecar or
bundled host sidecar, no remote URL) passes `false`; browser clients and desktop
clients using a remote host pass `true`. That flips codex to its device-code
flow (`codex login --device-auth`): the engine surfaces a verification URL plus
a one-time `ProviderLoginUrl.user_code`, the user enters that code on OpenAI's
page, and codex polls + writes `~/.codex/auth.json` itself (no paste-back).
**codex colourizes stdout even over a pipe**, so the relay strips ANSI escape
sequences from each line before scanning (`login_relay::strip_ansi`): the
`\x1b[94m` wrapper's trailing `m` otherwise sits flush against the code and
defeats the `\b` anchor in the device-code regex, leaving `user_code` unset and
the dialog wrongly stuck on paste-back. Claude has no device variant — its
standard login already completes headlessly via the paste-back code
(`/v1/providers/:name/login/code`), so the flag is a no-op for it. Note the
mid-chat `ProviderReconnectCard` doesn't render the dialog, so headless re-auth
currently routes through the picker/settings; the device-code requires the
user's OpenAI account to have device sign-in enabled.

### Cancelling / retrying a stuck sign-in

A login subprocess only ends when the CLI exits, the user pastes a code, or
the 10-minute relay timeout fires (`LOGIN_SESSION_TIMEOUT` in
`engine-core::provider::login_relay`). If the user closes the OAuth tab before
finishing, the CLI keeps its localhost callback open and just hangs — so the
status poll never flips to authenticated and the connect UI spins. Worse, a
fresh Connect click is rejected by `insert_session` as "already pending" until
the timeout, which read to users as "I have to restart the app" (#237).

`POST /v1/providers/:name/login/cancel` → `cancel_login` fixes this: it removes
the in-flight session from `LOGIN_SESSIONS` **eagerly** (so the next Connect
isn't rejected) and signals the relay task — which holds an `Arc<Notify>` clone
— to kill the subprocess. The relay emits a **benign**
`ProviderLoginComplete { success: false, error: null }`; the frontend treats a
completion with no `error` as "not an error" and silently clears its pending
spinner (no toast). A monotonic per-session token guards the relay's
end-of-life map cleanup so it can't evict a freshly-spawned retry session that
reused the same provider id. All three connect surfaces wire to it: the
onboarding brain mission's "Cancel and try again", the workspace-setup
`ProviderPicker`, and the AI Hub's provider cards (`components/ai-hub`, via the
`useProviderConnections` hook).

Codex has one extra wrinkle: it can emit retry-shaped 401 messages while it
refreshes or reconnects, then continue successfully. Treat the synthetic
`__auth_retry__` marker as provisional. Suppress it, remember it, and emit
`AuthRequired` only if the session exits with an auth-flavored error. Terminal
401 / unauthenticated messages still emit `AuthRequired` immediately.

OpenAI provider status should prefer `codex login status` over shallow
`~/.codex/auth.json` parsing. Keep the auth-file check only as fallback for old
Codex versions or unrelated config-load failures, because config drift should
not look like sign-out.

Provider status uses tri-state auth: `authenticated`, `unauthenticated`, or
`unknown`. Reconnect UI renders from feed signals only when status confirms
`unauthenticated`; `unknown` resolves the signal without a card.

Claude Code can sometimes return `Error: Unknown error` for non-auth failures.
Treat that shape as a prompt to run `claude auth status`, not as logout by
itself. Emit `AuthRequired` only when the status probe confirms
`unauthenticated`.

Never mutate `~/.codex/config.toml` to make Codex read Houston agent
instructions. Agent directories already expose `CLAUDE.md` through an
`AGENTS.md` symlink, and global Codex config writes can land under the active
TOML table and break Codex startup.

## Gemini (API key, no CLI login)

Gemini does not have an OAuth-style `gemini auth login`. The CLI reads
credentials from one of three places, in order:

1. `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) environment variable in the
   spawning shell.
2. `~/.gemini/.env` file with the same env-var format.
3. `~/.gemini/settings.json` with a `selectedAuthType` and matching
   credential block.

`GeminiAdapter::probe_auth` (in `engine/houston-terminal-manager/src/provider/gemini.rs`)
checks all three. Any positive signal returns `authenticated`; missing
file or missing key returns `unauthenticated`; parse / I/O errors map to
`unknown` (NOT `authenticated`, per the no-silent-failures rule).

`probe_auth` runs synchronously off the file system, no spawn. It is
the same path used by `GET /v1/providers/gemini/status` and by the
session runner's pre-spawn auth gate.

### `launch_login("gemini")` returns BadRequest

Because there is no CLI login, the `ProviderAdapter::login_args` impl
returns `None`. `engine-core::provider::launch_login` surfaces this as
`BadRequest("gemini has no CLI login flow, connect via settings instead")`.
Same for logout. The desktop frontend short-circuits before this path
is reached: the provider picker checks `loginKind === "apiKey"` and
opens the Connect-API-Key dialog instead of calling
`/v1/providers/gemini/login`.

### Connect flow (Option A-lite, current)

The picker's Gemini card opens a modal with three steps:

1. Open `https://aistudio.google.com/app/apikey` in the user's browser
   (`tauriSystem.openUrl`).
2. Show a Copy-able `export GEMINI_API_KEY=...` snippet.
3. Restart Houston so the env var is in scope for the engine
   subprocess.

Strings live under the `providers.apiKeyConnect.*` namespace
(`app/src/locales/{en,es,pt}/providers.json`). Component:
`app/src/components/shell/api-key-connect-dialog.tsx`. Provider config:
`app/src/lib/providers.ts` (`loginKind`, `apiKeyConsoleUrl`,
`apiKeyEnvVar` fields).

### Connect flow (Option A, in-flight)

The follow-up flow writes the key directly to `~/.gemini/.env` so the
user does not have to fiddle with shell rc files. The engine route is
`POST /v1/providers/gemini/credentials` (atomic write, mode 0600,
parent dir ensure). When the in-flight upgrade lands, the dialog gains
a paste input + Save button and the restart-Houston step disappears.

### HOME isolation for spawned gemini sessions

Gemini-cli loads `<HOME>/.gemini/GEMINI.md` as global memory on every
invocation, and its built-in memory tool auto-appends the user's
cross-project preferences to that file. Without isolation, every
Houston-spawned gemini inherits notes from the user's other projects
("Initializing Workspace... Ombra library", Alpine.js styling rules,
etc.) and answers Houston tasks with the wrong context.

`houston-terminal-manager::gemini_home::ensure_gemini_runtime_home`
builds a Houston-managed HOME at `~/.houston/runtime/gemini-home/`
containing only `.gemini/oauth_creds.json` + `google_accounts.json`
+ `.env` symlinked from the real home (so OAuth and API-key auth
both keep working without re-auth) plus a minimal
`.gemini/settings.json` that mirrors the user's `selectedType`. No
`GEMINI.md` is present, so global memory discovery finds nothing.
Per-agent context still flows because gemini-cli walks UP from
`cwd` and the agent dir contains `GEMINI.md → CLAUDE.md` seeded by
`seed_agent`. Both `gemini_runner::spawn_gemini` and
`sessions::summarize::run_gemini_summary` set `cmd.env("HOME", ...)`
to this runtime path before spawning.

**Windows symlink fallback.** Stock Windows installs reject
`symlink_file` (os error 1314, "A required privilege is not held by
the client") unless Developer Mode or admin is on. `ensure_symlink`
falls back to `fs::copy`. If the real-home source file does not
exist yet — common for first-time gemini users who have not
completed OAuth or pasted an API key — the Windows path treats the
missing source as "skip this entry" instead of erroring. Without
that, the user-visible toast was: _"Failed to prepare gemini
runtime home: The system cannot find the file specified. (os
error 2). Houston cannot spawn gemini safely without it."_

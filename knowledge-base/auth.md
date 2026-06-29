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

## Provider CLI re-auth (Claude Code / Codex)

_Provider CLI re-auth (Claude/Codex) is the legacy Rust-engine path; the TS engine uses in-process OAuth — see `convergence/README.md`._

Separate from Houston account auth. Claude Code and Codex keep their own CLI
sessions. When those sessions expire mid-chat, `houston-terminal-manager`
classifies auth-shaped stderr/stdout (`401`, `unauthorized`, `not authenticated`,
expired OAuth/API-key messages) and `houston-agents-conversations` emits
`HoustonEvent::AuthRequired`. Desktop listens in `use-session-events.ts`, sets
`authRequired`, and `ProviderReconnectCard` renders inside chat via
`ChatPanel.afterMessages`. The card opens `claude auth login --claudeai` or
`codex login` through `/v1/providers/:name/login` and polls provider status
until the CLI reports authenticated.

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
`ProviderPicker`, and the settings `ProviderSettings` account rows.

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

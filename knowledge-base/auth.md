# Auth (GCP Identity Platform / Firebase Auth, project `gethouston`)

Houston's client sign-in runs on **GCP Identity Platform (Firebase Auth)**,
project `gethouston`. Five ways in: **Google**, **Apple**, **Microsoft**,
passwordless **6-digit email code**, and (operators only) **email + password**
on `/admin`. Apple is per-surface: web popup, desktop GCIP-brokered loopback,
and **native** on iOS (`SignInWithAppleButton`), where App Store guideline 4.8
makes it mandatory alongside Google — see "iOS (native app)" below.
CI-release session tokens live in the macOS Keychain / Windows DPAPI, never
localStorage or disk. Local dev builds use worktree-scoped browser storage to
avoid repeated macOS Keychain prompts. Sign-in identifies the user in PostHog and
mints the bearer the cloud gateway verifies.

> **How we got here.** This platform replaced Supabase Auth in the client-auth
> migration. The migration record — what changed, the deliberate Supabase
> exceptions, and the open human follow-ups (OAuth client provenance, Azure app
> registration, GCIP email/password enablement) — lives in
> **`knowledge-base/auth-migration.md`**. `app/src/lib/supabase.ts` was deleted;
> auth now lives in `app/src/lib/identity/` + `app/src/lib/auth.ts`.
>
> **The website waitlist still uses Supabase** (`website/`, anon `POST
> /rest/v1/waitlist`) — that is a pure data write with no auth session and is
> intentionally left alone. Don't "finish" the migration by ripping it out.

## The gateway bearer contract (shared desktop + web)

The bearer the cloud gateway verifies is a **Firebase ID token** (JWT):

- issuer `https://securetoken.google.com/gethouston`, audience `gethouston`,
  `sub` = the Firebase UID (an opaque, fresh-platform user id).
- JWKS `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`
  (Google's public keys). Verification is a **`cloud/` gateway** change (Go side
  authoritative) — see `cloud/INTEGRATION.md`.
- Header shape is **unchanged**: `Authorization: Bearer <jwt>` plus `x-houston-org`.

The engine adapter reads the bearer **live per request** (`cp/context.ts`
`liveToken`, `cp/fetch.ts`) and on a **401** runs one single-flight refresh +
replay via `window.__HOUSTON_SESSION_REFRESH__` (`session-refresh.ts`). Nothing
about the header/replay seam changed with the provider swap — only the token's
provenance did.

## Sign-in methods

The UI is `SignInScreen` (`app/src/components/auth/sign-in-screen.tsx`): Google +
Apple + Microsoft buttons over a passwordless email field, on the
`SpaceBackground` backdrop (the landing page's Milky Way photograph — see
`knowledge-base/design-system.md`). Copy is
benefit-focused — the audience is non-technical, so no mention of OAuth / tokens /
APIs. The same screen renders for the app-wide gate (`App.tsx`) and for the
remote-gateway gate (`HostedEngineGate`). `app/src/components/auth/email-sign-in.tsx`
owns the two-step (email → code) email flow inline.

The dispatcher is `app/src/lib/auth.ts`. Every method branches on
`osIsTauri()` — desktop uses REST + a system-browser loopback; web uses the
firebase-js-sdk popup (loaded lazily behind the `@houston/web-identity` alias, so
the desktop bundle ships **zero** firebase-js-sdk). Every failure becomes a typed
`IdentityError`; user-initiated calls emit the `.code` on the auth-error bus AND
rethrow (see "Error surfacing").

### Google / Microsoft — desktop (loopback + PKCE → GCIP REST)

```
User clicks "Continue with Google" (or Microsoft) in SignInScreen
 → auth.ts signInWithGoogle() / signInWithMicrosoft():
    1. runLoopbackAuthorize(): mint PKCE verifier + CSRF state,
       osStartOauthLoopback() → 127.0.0.1:<8975-8978>/auth/callback,
       open the provider authorize URL in the SYSTEM browser
       (onBrowserOpened() frees the sign-in buttons the instant it opens)
 → provider consent in the system browser
 → 302 → 127.0.0.1:<port>/auth/callback?code=…&state=…
 → oauth_loopback.rs captures it, emits `auth://deep-link`, brings the window front
 → oauth-callback.ts parseCallbackUrl(): validate CSRF `state` FIRST, then code
    2. exchange code at the provider token endpoint (google-authorize.ts /
       microsoft-authorize.ts) → provider id_token (Google also sends its
       installed-app client_secret; Microsoft is a public PKCE client, no secret)
    3. firebase-rest.ts signInWithIdp({ providerId, idToken }) → Firebase session
    4. session-from-idp.ts assembles the Session; saveSession() → Keychain;
       cacheSession() flips the gate; startProactiveRefresh(); PostHog track
```

The loopback ports `8975-8978` must be **Authorized redirect URIs** on the
**Desktop OAuth client** (Google) / Azure app registration (Microsoft). The Rust
loopback (`app/src-tauri/src/oauth_loopback.rs`) is a dumb listener: it forwards
`?code=&state=` verbatim on the `auth://deep-link` event and never sees the
client secret or does a token exchange (TS owns both). A `cancel_oauth_loopback`
command frees the port immediately on cancel.

**Benign-cancel model.** A re-click (supersession), the sign-in screen unmounting
(`cancelPendingAuthorize()` on unmount), and the 300s timeout all resolve `null` —
no session, no error toast — so an abandoned browser tab can never freeze the
buttons or fire a minutes-later error. A **foreign-state** callback (a stale tab's,
delivered onto the shared `auth://deep-link` channel after a loopback port rebinds)
is **ignored** — the attempt keeps waiting for its own correct-state callback
rather than failing. Only a genuine callback error (provider `error` param on a
matching state, unreadable payload, missing code) or a failure to open the browser
/ bind the loopback rejects typed. **There is no `houston://auth-callback`
fallback** — Google/Microsoft reject custom-scheme redirects on direct OAuth, so a
loopback-bind failure surfaces a typed error for the generic retry UI.

### Apple — web (popup) + desktop (gateway bridge + `houston://` deep link)

Apple **rejects `127.0.0.1` redirect URIs on direct OAuth** (HTTP 403 at the
authorize endpoint), so the desktop can't run the Google/Microsoft
loopback+PKCE shape against Apple. And GCIP's `createAuthUri` passes the
`continueUri` to the provider **verbatim** as `redirect_uri` — it does NOT
broker through its `/__/auth/handler` (an earlier version of this doc claimed
it did; that was wrong and shipped a desktop Apple button that always 403'd).
The desktop flow instead returns through the cloud gateway's HTTPS bridge
(`identity/apple-authorize.ts`, the pinned contract of record):

```
1. GCIP REST accounts:createAuthUri({ providerId: "apple.com",
   continueUri: {gateway}/v1/auth/apple/return, oauthScope: "name email" })
   → { authUri, sessionId }   (redirect_uri = the bridge URL, which is a
     registered Services-ID return URL; GCIP forces response_mode=form_post)
2. open authUri in the system browser → Apple consent →
   form_post to the gateway bridge
3. the bridge navigates the browser to houston://auth-callback?<the same
   params as a query> (stateless POST→GET conversion; no secrets) → the OS
   routes the deep link to the app; the Rust shell forwards it onto the same
   `auth://deep-link` event the loopback flows use (lib.rs →
   auth::is_auth_callback_deep_link)
4. CSRF: the `state` GCIP embedded in authUri is enforced on the callback
   (parseCallbackQuery), stale/foreign callbacks are ignored, exactly like PKCE
5. accounts:signInWithIdp({ requestUri: <bridge URL>?<query>, sessionId })
   → Firebase session (the Apple client secret lives ONLY in the identity
   project's provider config, never on the client)
```

Web uses the ordinary popup: `signInWithPopup(new OAuthProvider("apple.com"))`
with `email` + `name` scopes (`packages/web/src/identity/firebase-popup.ts`).
Apple returns the user's name/email only on the FIRST consent per Services ID.
No new baked env vars — the bridge URL derives from the gateway URL the client
already has (`auth-gateway.ts` `gatewayUrl()`).

**One-time human setup:** enable the Apple provider on the identity project
(Apple Developer: App ID + **Services ID** whose return URLs are the GCIP
handler (web popup) AND the gateway bridge (desktop), team ID, key ID +
private key → GCIP console / terraform), add the gateway domain to the
project's **authorized domains** so `createAuthUri` accepts the bridge
`continueUri`, and ship the gateway bridge endpoint
(`POST /v1/auth/apple/return` — contract pinned in `apple-authorize.ts`).

The button renders UNCONDITIONALLY, exactly like Google and Microsoft — no
flag (the old Apple sign-in enable gate was deleted per the "Features default
ON — no dark switches" rule; it kept the shipped button invisible for months).

### Google / Microsoft — web (firebase-js-sdk popup)

`packages/web/src/identity/firebase-popup.ts`: `initializeApp` + `getAuth` +
`browserLocalPersistence`, then `signInWithPopup(GoogleAuthProvider)` /
`signInWithPopup(new OAuthProvider("microsoft.com"))`. The SDK owns persistence +
auto-refresh; `onIdTokenChanged` mirrors the live token into the engine global and
the `["session"]` cache (`cloud-login.tsx`). A cancelled popup resolves `null`
(benign). No redirect bridge, no `detectSessionInUrl`.

### Email OTP (6-digit) — all surfaces

GCIP has no native 6-digit OTP, so the **gateway owns it** and hands back a GCIP
**custom token** the client exchanges for a normal Firebase session
(`app/src/lib/identity/otp.ts`, the pinned contract of record):

```
POST {gateway}/v1/auth/email-otp/start   { email }        → 204   (gateway emails a code)
POST {gateway}/v1/auth/email-otp/verify  { email, code }  → 200 { customToken }
                                                             401 → otp_invalid_code
                                                             429 → otp_rate_limited
signInWithCustomToken(customToken)   (REST on desktop, SDK on web) → Firebase session
decodeIdTokenClaims(idToken) fills uid/email/name → Session (provider: "custom")
```

The gateway base URL is the engine URL the client already has
(`auth-gateway.ts` `gatewayUrl()` → `resolveEngine` / `window.__HOUSTON_ENGINE__.baseUrl`;
a typed throw when none is configured, never a silent no-op).

### iOS (native app) — `houston/mobile/ios/Houston/Core/Auth/`

The iOS app is a **REST GCIP client like the desktop** (the app has a
zero-third-party-packages policy, so no firebase-ios-sdk). Four ways in, all
landing on the same `AuthSession` (Firebase ID token = the gateway bearer,
Keychain-persisted, proactive + on-demand refresh via securetoken):

- **Apple (native)** — SwiftUI `SignInWithAppleButton` →
  `ASAuthorizationAppleIDCredential.identityToken` + a nonce pair (SHA-256 hex
  to Apple, raw to GCIP) → `signInWithIdp(apple.com)`
  (`AuthController+Apple.swift`, `AppleNonce.swift`). Fully native — unlike the
  web popup / desktop brokered flows above, it needs no Services ID or secret,
  only the `apple.com` IdP enabled (`cloud/infra/terraform/identity.tf`) and
  the Sign in with Apple capability on the App ID. Apple returns the user's
  name only on FIRST authorization — carried into the session as a fallback
  display name.
- **Google** — `ASWebAuthenticationSession` + PKCE (S256) against an **iOS-type
  OAuth client** (public, secret-less; redirect = the reversed-client-ID
  scheme), token exchange, `id_token` → `signInWithIdp(google.com)`
  (`OAuthCodeFlow.swift`, `ProviderSpecs.swift`). Deliberately NOT the
  desktop's installed-app client (that one carries a baked secret).
- **Microsoft** — same `OAuthCodeFlow`, Entra `common` tenant public client,
  redirect `houston://auth-callback` (listed under the Azure app's
  "Mobile and desktop applications").
- **Email code** — the same gateway OTP contract as desktop/web →
  `signInWithCustomToken`; identity comes from decoded ID-token claims
  (`EmailOtpClient.swift`, `IdTokenClaims.swift`).

Google/Microsoft client ids are paste-in constants in `App/Config.swift`;
while empty those buttons surface the `providerDisabled` copy (never a silent
no-op). Errors map once to the desktop taxonomy (`IdentityError.swift` mirrors
`identity/errors.ts`; `AuthErrorCopy.swift` mirrors `auth-errors.ts`; copy
mirrors `errors:auth.*` in en/es/pt). A legacy Supabase Keychain blob is
discarded-with-log on load (the `session-store.ts` lesson). Wire shapes are
pinned by `HoustonTests/Auth/*` against `identity/firebase-rest.ts`.

### Admin (`/admin`) — email/password + Google popup

The operator dashboard (`packages/web/src/admin/*`) is self-contained: it can't
reach the desktop Keychain, so it does NOT use `identity/refresh.ts` /
`session-store.ts`. `admin/auth.ts` (pure, tested) + `admin/use-admin-auth.ts`:
email/password via REST `signInWithPassword`, Google via the web popup; both yield
an `AdminSession { idToken, refreshToken, expiresAt, email }`. A single proactive
`refreshIdToken` timer keeps the bearer fresh (terminal-vs-transient like
`refresh.ts`); the session persists to localStorage for reload survival. The live
`idToken` is the control-plane bearer. The operator allowlist (`CP_ADMIN_USER_IDS`)
is the real gate, enforced gateway-side — the UI just shows the 403/404 reason.

> **Infra follow-up (open):** `cloud-tf/infra/terraform/identity.tf` enables the
> Google + Microsoft IdPs but **not** the email/password method, so admin
> email/password returns GCIP `OPERATION_NOT_ALLOWED` ("This sign-in method isn't
> enabled for operators.") until infra adds a `sign_in { email { enabled = true } }`
> block. Google popup works. Admin accounts are provisioned out-of-band; the UI
> only signs existing accounts in.

## Session + Keychain model

`Session = { idToken, refreshToken, uid, email, emailVerified, displayName,
photoUrl, provider, expiresAt }`, `provider ∈ google.com | microsoft.com |
apple.com | password | custom` (`identity/session.ts`).

| Piece | Where |
|---|---|
| Session JSON blob | CI releases: Keychain service `com.houston.app.auth`, key `houston-auth` (Windows: DPAPI file) |
| PKCE code verifier | **In memory** for the flow — desktop owns both ends of the loopback, so no Keychain round-trip |
| Storage adapter | `identity/session-store.ts` → os-bridge `osAuthGetItem/SetItem/RemoveItem` → Tauri `auth_*` cmds (`app/src-tauri/src/auth.rs`) |
| Local dev storage | Browser storage, worktree-scoped key `houston-auth-local-<hash>` |
| Rust dep | `keyring = "3"` (`apple-native` + `windows-native`) |

`session-store.ts` reuses the `houston-auth` key, so an upgrading user may have a
stale **Supabase** blob under it — `deserializeSession` treats any non-Firebase
shape (legacy blob / corrupt JSON) as signed-out: discard + log, never throw, never
silently accept (`identity/session.ts`). If the Keychain is locked, the in-memory
session on the current run still works but nothing persists across launches —
degraded mode, not failure. Override the storage backend with
`HOUSTON_AUTH_STORAGE=keychain|browser`.

`useSession` (`app/src/hooks/use-session.ts`) is the TanStack source of truth
(`SESSION_QUERY_KEY = ["session"]`): desktop reads the Keychain via `loadSession`
and mirrors `subscribeSession` broadcasts; web awaits the first `onIdTokenChanged`
so a returning user never flashes signed-out. `App.tsx` renders `SignInScreen`
when `isIdentityConfigured() && !session`.

## Refresh

`identity/refresh.ts` runs a proactive timer that refreshes ~5 min before
`expiresAt` (`REFRESH_SKEW_MS`), replacing Supabase's `autoRefreshToken`. It also
backs `window.__HOUSTON_SESSION_REFRESH__` (`refreshNow()`, single-flight) for the
gateway 401 seam — **no engine-adapter change**. Firebase refresh tokens are
long-lived and not rotated. A terminal refresh failure (revoked/expired refresh
token) resolves `null` → a real sign-out surfaced by the auth gate; a transient
throw is logged and treated as `null` so the 401 surfaces rather than crashing the
refresher. On web the firebase-js-sdk owns refresh; `webRefreshIdToken` force-mints
a fresh token for the same seam.

## Sign-out

`signOut()` (`app/src/lib/auth.ts`) does a full cleanup: `stopProactiveRefresh()` +
`clearSession()` (Keychain, desktop) or `webSignOut()` (SDK, web) → `cacheSession(null)`
→ `clearPersistedLocalData()` (wipes locally persisted per-user data, HOU-712) →
`analytics.reset()` (so later anonymous events don't attach to the prior user). A
failed remote/Keychain clear is logged, never silent, and never blocks local
cleanup. The desktop hosted-mode **engine bearer clears reactively**: `cacheSession(null)`
→ `["session"]` null → `HostedEngineGate` effect calls `setHostedEngineSessionToken(null)`.

## The `identity/` module map (`app/src/lib/identity/`)

| Module | Role |
|---|---|
| `config.ts` | Reads baked `__FIREBASE_*__` (+ `VITE_FIREBASE_*` dev override); `identityConfig`, `isIdentityConfigured()` = apiKey && projectId |
| `errors.ts` | `IdentityError` + the `IdentityErrorCode` union + `mapGcipCode` (raw GCIP code → stable code, mapped ONCE; downstream never string-matches) |
| `rest-client.ts` | Transport core — the one place GCIP error bodies become typed errors |
| `firebase-rest.ts` | `signInWithIdp` (generic), `signInWithCustomToken`, `refreshIdToken`, `signInWithPassword` |
| `id-token.ts` | `decodeIdTokenClaims` (decode-only, for the custom-token OTP path) |
| `otp.ts` | `startEmailOtp` / `verifyEmailOtp` (gateway contract; module header is the pinned contract) |
| `session.ts` | `Session` shape + shape-tolerant serialize/deserialize + `sessionExpiresWithin` |
| `session-store.ts` | Keychain/browser persistence + `subscribeSession` + `SESSION_QUERY_KEY` |
| `refresh.ts` | Proactive timer, `refreshNow` (401 seam), `setSessionSink`, `start/stopProactiveRefresh` |
| `desktop-oauth.ts` | Loopback+PKCE driver (Tauri wiring); shared by Google + Microsoft |
| `oauth-attempt.ts` | Tauri-free attempt lifecycle (supersede / cancel / timeout / ignore-foreign-state) — unit-testable |
| `oauth-callback.ts` | Pure callback parser: CSRF `state` validated first; `isCsrfStateMismatch` predicate |
| `pkce.ts` | Code verifier / S256 challenge / state |
| `google-authorize.ts` / `microsoft-authorize.ts` | Provider authorize + token-exchange specifics |
| `desktop-signin.ts` | `google/microsoft/customToken DesktopSession` — authorize → REST → Session |
| `session-from-idp.ts` | `IdpSignInResult` → `Session` |
| `log.ts` | node-test-safe log seam (`setIdentityLogSink` / `identityLog`) |
| `index.ts` | Barrel |
| `firebase-popup-stub.ts` | Desktop stub for `@houston/web-identity` (each export throws) — keeps firebase out of the desktop bundle |

Web-only: `packages/web/src/identity/firebase-popup.ts` (the real firebase-js-sdk
surface, aliased as `@houston/web-identity`) + `firebase-errors.ts` (SDK error →
`IdentityError` mapping, benign-popup-cancel detection).

## Error surfacing (no silent failures)

Every sign-in failure is classified ONCE into an `IdentityErrorCode`
(`identity/errors.ts`) and collapsed to a localized copy bucket by
`app/src/components/auth/auth-errors.ts` `authErrorKey()` (an exhaustive
`Record<IdentityErrorCode, …>` — a new code fails to compile until bucketed). The
`errors.auth.*` keys exist in **en / es / pt**. OAuth failures that happen AFTER
the browser hands off (provider rejection, code-exchange failure) arrive on the
`auth-error-bus` (`onAuthError`) and render on `SignInScreen`; email-OTP errors
render inline in `EmailSignIn` (emitted with `emit:false` to avoid a double render).

The identity log seam (`identity/log.ts`) is wired to the app logger by
`initFrontendLogging()` (`app/src/lib/logger.ts`), called at startup by **both**
entrypoints — `app/src/main.tsx` (desktop) and `packages/web/src/app-tree.tsx`
(web) — and by `packages/web/src/admin/dashboard.tsx` (the `/admin` entry, which
does not go through app-tree). Until a sink is set the seam falls back to `console`
(never silent).

## Gating + offline

- `isIdentityConfigured()` (baked `FIREBASE_API_KEY` && `FIREBASE_PROJECT_ID`) is
  the master switch. Unconfigured builds skip auth entirely — local dev without
  secrets still boots.
- `App.tsx`: splash while `useSession()` loads, `SignInScreen` once it resolves to
  `null`, the app otherwise.
- Cached Keychain session serves `loadSession()` offline; an unrefreshable token
  degrades gracefully (identical to signed-in-but-stale), it does not kick the user.

## Desktop hosted mode + the OAuth toggle (HOU-611)

The desktop app talks to the managed gateway when `VITE_HOSTED_ENGINE_URL` is set;
there the bearer is the **Firebase ID token**, fed to the engine client via
`setHostedEngineSessionToken` (`app/src/lib/engine.ts`) from the `useSession`
→ `HostedEngineGate` reactive path. Whether that sign-in gate runs is the
`VITE_HOSTED_ENGINE_AUTH` switch (`app/src/lib/engine-mode.ts`):

| `VITE_HOSTED_ENGINE_AUTH` | Behavior |
|---|---|
| unset (hosted URL set) | **`oauth`** — sign-in required (managed-cloud default) |
| `oauth` / `google` / `1` / `true` / `on` (legacy alias `supabase`) | sign-in required |
| `static` / `token` / `none` / `0` / `false` / `off` | no login — hosted URL + static bearer (`VITE_HOSTED_ENGINE_TOKEN`), for service-token smoke tests |

Hosted OAuth needs a baked Firebase project. A build that turns OAuth on without
one can never obtain a token, so `HostedEngineGate` renders a loud "Sign-in
required" screen (`shell:engineGate.authRequired*`) instead of spinning forever.
Signed cloud desktop builds ship on the `cloud-v*` release channel (see
`convergence/README.md`).

### Testing sign-in against the local kind gateway

Bake the Firebase project into the dev build — in `app/.env.local`:

```
FIREBASE_API_KEY=<web-api-key>
FIREBASE_AUTH_DOMAIN=gethouston.firebaseapp.com
FIREBASE_PROJECT_ID=gethouston
GOOGLE_DESKTOP_CLIENT_ID=<desktop-oauth-client-id>
GOOGLE_DESKTOP_CLIENT_SECRET=<installed-app-secret>
MICROSOFT_DESKTOP_CLIENT_ID=<entra-public-client-id>
VITE_HOSTED_ENGINE_URL=http://localhost:9080
# VITE_HOSTED_ENGINE_AUTH defaults to oauth when the hosted URL is set;
# set it to `static` (+ VITE_HOSTED_ENGINE_TOKEN) to test the no-login path.
```

Bring the gateway up (`make kind-up` in `cloud/`) with its Firebase issuer/JWKS
env set, then `pnpm tauri dev` in `app/` → sign in → the verified Firebase ID
token reaches the gateway, which provisions your per-user pod. (Dev builds sign in
with the passwordless email code: the loopback opens the SYSTEM browser, and a
Google/Microsoft consent redirect can land in the installed prod app, so the
OAuth buttons are prod-only there — HOU-642.)

## PostHog identity

- Anonymous launch: `distinct_id = install_id` (`install-id.ts`).
- Sign-in: `analytics.alias(firebaseUid, { email, name })` — merges pre-signup
  history onto the identified user; the person property is `firebase_uid`.
- Sign-out: `analytics.reset()` — future events use a fresh anonymous id.

> The uid switched from the Supabase id to the Firebase uid — a fresh platform, so
> historical Supabase-id joins break. Acceptable, intentional discontinuity
> (`auth-migration.md`, "Intentional discontinuities").

## Config / secrets matrix

All Firebase web values are **public by design** (the apiKey is not a secret —
access is gated by GCIP provider config + the gateway allowlist), so they are
baked into the bundle at build time exactly as the Supabase anon key was.

| Var | Baked as (Vite `define`) | Source / notes |
|---|---|---|
| `FIREBASE_API_KEY` | `__FIREBASE_API_KEY__` | Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | `__FIREBASE_AUTH_DOMAIN__` | e.g. `gethouston.firebaseapp.com` (web popup domain) |
| `FIREBASE_PROJECT_ID` | `__FIREBASE_PROJECT_ID__` | `gethouston` — token issuer/audience |
| `GOOGLE_DESKTOP_CLIENT_ID` | `__GOOGLE_DESKTOP_CLIENT_ID__` | Google "Desktop app" OAuth client (loopback + PKCE) |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | `__GOOGLE_DESKTOP_CLIENT_SECRET__` | Non-confidential installed-app secret; the code→id_token exchange runs in TS |
| `MICROSOFT_DESKTOP_CLIENT_ID` | `__MICROSOFT_DESKTOP_CLIENT_ID__` | Entra **public** client (PKCE, no secret) |

- **Dev override (no rebuild):** `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN`
  / `VITE_FIREBASE_PROJECT_ID` (`import.meta.env`), so a scratch project is a
  `.env.local` edit. See `app/src-tauri/.env.example` + the repo-root `.env.example`.
- **Baked in both bundles:** `app/vite.config.ts` + `packages/web/vite.config.ts`
  (auth-domain defaults `gethouston.firebaseapp.com`, project defaults `gethouston`).
- **Release CI:** `.github/workflows/release.yml` sets all six from GitHub Secrets
  in each of the three Tauri build blocks (macOS / Windows / Linux). The old
  `SUPABASE_URL` / `SUPABASE_ANON_KEY` were fully removed.
- **Web image:** `packages/web/Dockerfile` documents the `FIREBASE_*` build args
  (the SPA config bakes at `pnpm --filter houston-web build`; the image just
  serves `dist`).

## One-time GCP / Firebase setup (human)

See `knowledge-base/auth-migration.md` ("Open human / cross-repo follow-ups") for
the full checklist and open human tasks. In brief:

1. **Web/admin Google provider** — enable Google in the GCIP console; the web
   popup uses the GCIP handler redirect `https://gethouston.firebaseapp.com/__/auth/handler`.
2. **Desktop OAuth client** — a Google "Desktop app" client (PKCE) with the
   `127.0.0.1` loopback ports as authorized redirect URIs; its "secret" is the
   non-confidential installed-app secret (baked via env, never a literal).
3. **Microsoft** — an Azure app registration (`microsoft.com` GCIP provider) whose
   redirect includes the desktop loopback ports; public PKCE client, no secret.
4. **Apple** — Apple Developer App ID + Services ID (return URLs = the GCIP
   handler for the web popup AND the gateway bridge for desktop) + key; enable
   the `apple.com` provider in GCIP; add the gateway domain to authorized
   domains; ship the gateway `POST /v1/auth/apple/return` bridge (contract in
   `identity/apple-authorize.ts`).
5. **Email OTP** — the `POST /v1/auth/email-otp/{start,verify}` endpoints are a
   `cloud/` gateway build (contract pinned in `identity/otp.ts`).
6. **Gateway verifier** — issuer/JWKS swap to Firebase is a `cloud` Go change; the
   gateway must accept Firebase tokens before/with the client cutover.
7. **iOS** — register a Google **iOS** OAuth client in project `gethouston` and
   paste its id into `mobile/ios/Houston/App/Config.swift`; add
   `houston://auth-callback` to the Azure app registration's mobile redirect
   URIs and paste the app id likewise; enable the Sign in with Apple capability
   on App ID `com.gethouston.Houston` and apply the `apple.com` IdP terraform
   (`cloud/infra/terraform/identity.tf`); create the App Store Connect app
   record for TestFlight (`.github/workflows/ios-testflight.yml`, secret
   `APPLE_TEAM_ID`).

## What's deliberately out of scope

- Server-side (Rust) emitting PostHog events directly — the frontend covers
  Houston's event surface. **The engine receives no user-id env at spawn today**
  (an earlier note claiming a `HOUSTON_APP_USER_ID` env was passed was inaccurate —
  no such variable exists; add an envelope carrier when a server-side consumer
  needs the uid).
- A gateway-backed profile/avatar store. The old Supabase `public.profiles` table +
  avatar storage retired with Supabase auth (RLS `auth.uid()` can't match Firebase
  uids); `use-user-profiles.ts` is stubbed, so faces fall back to initials and
  self-face uses the session `displayName`/`photoUrl` until the gateway store lands.

## Teams / orgs

Orgs, roles (owner/admin/user), per-agent access, and C8 Spaces ship in the paid
hosted cloud; the **gateway** owns and enforces all of it (org membership lives in
the gateway's Postgres, not the identity project). The open repo carries only the
capability-gated client surface. Client model: `knowledge-base/teams.md`. Server
contracts: `cloud/docs/contracts/C3`, `C7-teams.md`, `C8-spaces-billing.md`.

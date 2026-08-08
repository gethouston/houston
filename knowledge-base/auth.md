# Auth (GCP Identity Platform / Firebase Auth, project `gethouston`)

Houston's client sign-in runs on **GCP Identity Platform (Firebase Auth)**, project
`gethouston`. Five ways in: **Google**, **Apple**, **Microsoft**, passwordless **6-digit
email code**, and (operators only) **email + password** on `/admin`. Apple is
per-surface: web popup, desktop GCIP-brokered bridge, and **native** on iOS.

Session tokens live in the macOS Keychain / Windows DPAPI / Linux Secret Service — never
localStorage or disk. Local dev builds use worktree-scoped browser storage to avoid
repeated Keychain prompts. Sign-in identifies the user in PostHog and mints the bearer the
cloud gateway verifies. Auth code lives in `app/src/lib/identity/` + `app/src/lib/auth.ts`.

## The gateway bearer contract (shared desktop + web)

- The bearer is a **Firebase ID token** (JWT): issuer
  `https://securetoken.google.com/gethouston`, audience `gethouston`, `sub` = the Firebase
  UID (an opaque, fresh-platform user id).
- JWKS `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`.
  Verification is a **`cloud/` gateway** concern (Go side authoritative) — see
  `cloud/INTEGRATION.md`.
- Header shape: `Authorization: Bearer <jwt>` plus `x-houston-org`.
- The engine adapter reads the bearer **live per request** — `liveToken`
  (`packages/web/src/engine-adapter/cp/fetch.ts:41`), consumed by
  `engine-adapter/client/context.ts`, `cp/events.ts` and `engine-adapter/store-gateway.ts`.
  There is no `cp/context.ts`.
- On a **401** the adapter runs one single-flight refresh + replay via
  `window.__HOUSTON_SESSION_REFRESH__` (`packages/web/src/engine-adapter/session-refresh.ts`;
  the global is installed from `identity/refresh.ts`).

## Sign-in screen

`app/src/components/auth/sign-in-screen.tsx`, rendered both for the app-wide gate
(`App.tsx`) and the remote-gateway gate (`HostedEngineGate`).

- A `<FirstRunScreen>` wrapper — calm grey background, **pinned light** so it reads
  identically in both app themes. Houston wordmark + `HoustonLogo` top-left.
- Centered **two-panel card**: `grid max-w-3xl sm:grid-cols-3`, `rounded-2xl border
  border-line bg-card` with a soft shadow. Left panel (`sm:col-span-2`) = title, an
  optional `ContinueLastSignIn` filled button + "or use another way" divider,
  `ProviderButtonRow` (Google / Apple / Microsoft icon pills), an "or" divider, and
  `EmailSignIn` (the two-step email → 6-digit code flow,
  `app/src/components/auth/email-sign-in.tsx`). Right panel = `<ReferralPanel>`.
  `<LegalFooter>` anchors the bottom.
- Copy is benefit-focused — the audience is non-technical, so no mention of OAuth /
  tokens / APIs.
- The dispatcher is `app/src/lib/auth.ts`. Every method branches on `osIsTauri()`: desktop
  uses REST + a system-browser loopback; web uses the firebase-js-sdk popup, loaded lazily
  behind the `@houston/web-identity` alias so the desktop bundle ships **zero**
  firebase-js-sdk. Every failure becomes a typed `IdentityError`; user-initiated calls emit
  the `.code` on the auth-error bus AND rethrow.

## Google — desktop (loopback + PKCE → GCIP REST)

```
User clicks "Continue with Google"
 → auth.ts signInWithGoogle():
    1. runLoopbackAuthorize(): mint PKCE verifier + CSRF state,
       osStartOauthLoopback(state) → { status, redirectUri: 127.0.0.1:<8975-8978>/auth/callback,
       port, attemptId } ("superseded" → benign null), open the provider authorize URL in the
       SYSTEM browser (onBrowserOpened() frees the buttons the instant it opens; a 15s
       deadline bounds everything up to that point)
 → provider consent → 302 → 127.0.0.1:<port>/auth/callback?code=&state=
 → oauth_loopback/ matches the state, emits `auth://deep-link`, brings the window front
 → oauth-callback.ts parseCallbackUrl(): validate CSRF `state` FIRST, then code
    2. exchange the code at Google's token endpoint (google-authorize.ts; the installed-app
       client_secret rides along — Google's "Desktop app" clients require it even though
       they are non-confidential)
    3. firebase-rest.ts signInWithIdp({ providerId, idToken }) → Firebase session
    4. session-from-idp.ts assembles the Session; saveSession() → Keychain; cacheSession()
       flips the gate; startProactiveRefresh(); PostHog track   (3-4 in sign-in-establish.ts)
```

## Microsoft — desktop (GCIP-BROKERED over the loopback, HOU-1112)

Microsoft can NOT run the Google-style client-side exchange, for two independently fatal
reasons (both verified live):

- Entra refuses a public-client code redemption made from a webview — the fetch carries an
  `Origin` header (`http://tauri.localhost` on Windows), and **AADSTS90023** restricts
  cross-origin redemption to SPA registrations.
- GCIP refuses Microsoft tokens it did not obtain itself: `signInWithIdp({ id_token |
  access_token })` for `microsoft.com` always fails with
  `INVALID_CREDENTIAL_OR_PROVIDER_ID`, with or without a nonce.

So the desktop uses the GCIP-brokered shape (`brokered-loopback.ts` +
`microsoft-authorize.ts`): for each candidate port, `createAuthUri` mints the Entra
authorize URL for `continueUri = http://localhost:<port>/auth/callback` (GCIP owns the CSRF
`state`), `osStartOauthLoopback(state, exactPort)` binds EXACTLY that port (`portBusy` →
re-mint for the next candidate), and after the loopback catches the redirect
`signInWithIdpSession({ requestUri, sessionId })` lets GCIP redeem the code SERVER-SIDE with
the client secret from the identity project's provider config. **No Microsoft client id or
secret ships in the app** — there is no `__MICROSOFT_DESKTOP_CLIENT_ID__` define.

**Redirect registration.** Ports `8975-8978` must be Authorized redirect URIs on the
**Desktop OAuth client** as `http://127.0.0.1:<port>/auth/callback` (Google) and on the
Azure app registration's **Web** platform as `http://localhost:<port>/auth/callback`
(Microsoft — Entra only allows plain http on the Web platform for `localhost`, and
login.live.com matches exactly, with no port-agnostic loopback).

The Rust loopback (`app/src-tauri/src/oauth_loopback/`) binds BOTH `127.0.0.1` and `::1` (a
browser resolving `localhost` may pick IPv6), forwards `?code=&state=` verbatim on the
`auth://deep-link` event, and never sees a client secret or does a token exchange.

## The loopback is attempt-scoped

`oauth_loopback/`: `mod.rs` commands, `state.rs` registry, `listener.rs` bind/supersede,
`callback.rs` serve loop, `pages.rs` the two served pages. Four rules, each fixing a way
sign-in used to wedge until the app was quit:

1. **`start_oauth_loopback(expected_state)` is told the CSRF `state` up front.** Only a
   callback echoing THAT state completes the listener (a provider `error` on a matching
   state counts — it is a real answer). Everything else, including a callback with **no
   `state` at all**, gets a "this sign-in link has expired" page and the listener **keeps
   listening**. Before this, any request to `/auth/callback` consumed the one-shot listener,
   so a restored browser tab replaying an old redirect — or a bare
   `curl 127.0.0.1:8975/auth/callback?code=x` — killed the listener the real sign-in was
   waiting on, and the attempt sat silent for the full 300s. No legitimate loopback callback
   is state-less: `runLoopbackAuthorize` always sends `state`, Google and Microsoft echo it
   on success AND on their error redirects (RFC 6749 §4.1.2.1), and the one flow that omits
   it (Apple) never touches this listener.
2. **Supersede-then-bind.** A new attempt cancels the previous listener and waits (≤1s) for
   its port to be released BEFORE binding, so a re-click reuses the same port. Binding first
   meant every re-click stepped to the next candidate and the fourth exhausted the list.
3. **`cancel_oauth_loopback(attempt_id)` is id-scoped.** `start` returns
   `{ status: "listening", redirectUri, attemptId }`; a cancel only fires a listener whose id
   matches, so an abandoned attempt's fire-and-forget cancel can never free the NEXT
   attempt's port. The listener clears its own registry slot when it ends.
4. **Concurrent starts are ordered by USER INITIATION, not by completion.** The attempt id is
   a monotonic **generation** minted at command entry, and both `claim` (before binding) and
   `install` (after) refuse a generation older than the newest seen. Two rapid clicks used to
   be resolved by whichever coroutine reached `install` last — which could be the OLDER
   click. A start that loses drops the socket it bound and returns `{ status: "superseded" }`,
   which TS treats as a benign `null`.

**Benign-cancel model.** A re-click (supersession), the sign-in screen unmounting or a
sign-out (`cancelPendingAuthorize()`), and the 300s callback timeout all resolve `null` — no
session, no error toast — so an abandoned browser tab can never freeze the buttons or fire a
minutes-later error. A **foreign-state** callback (a stale tab's, delivered onto the shared
`auth://deep-link` channel) is **ignored**; the attempt keeps waiting for its own. Only a
genuine callback error (provider `error` param on a matching state, unreadable payload,
missing code) or a failure of the pre-browser leg rejects typed. **There is no
`houston://auth-callback` fallback** — Google/Microsoft reject custom-scheme redirects on
direct OAuth, so a loopback-bind failure surfaces a typed error for the generic retry UI.

**Pre-browser deadline (15s).** The benign model applies only AFTER the browser has the
flow. Until `onBrowserOpened` fires the buttons are latched and the user sees nothing, so
the whole pre-browser leg (the `start_oauth_loopback` invoke, PKCE, the system-browser
hand-off) is bounded by `BROWSER_OPEN_TIMEOUT_MS` (`identity/oauth-attempt-contract.ts`) and
**rejects typed** (`browser_open_timeout` → `errors:auth.signInTimeout`). The deadline lives
at the identity layer, not as a UI `setTimeout`, so expiry also tears the attempt down and
frees the native port through `abandonLoopback`. `onBrowserOpened` cancels it. The invoke
itself cannot be cancelled mid-flight — its `attemptId` does not exist until it returns — so
`withBrowserOpenDeadline` takes a **`releaseIfLate`** callback: a native start that answers
after we gave up has its listener cancelled the instant it appears and is never installed.
Without that, an orphaned listener held its port for Rust's full 300s.

## Apple — web popup + desktop gateway bridge

Apple **rejects `127.0.0.1` redirect URIs on direct OAuth** (HTTP 403 at the authorize
endpoint), and GCIP's `createAuthUri` passes the `continueUri` to the provider **verbatim**
as `redirect_uri` — it does NOT broker through its `/__/auth/handler`. So the desktop
returns through the cloud gateway's HTTPS bridge (`identity/apple-authorize.ts` +
`apple-return.ts`, the pinned contract of record):

```
1. GCIP REST accounts:createAuthUri({ providerId: "apple.com",
   continueUri: {gateway}/v1/auth/apple/return, oauthScope: "name email" })
   → { authUri, sessionId }   (redirect_uri = the bridge URL, a registered Services-ID
     return URL; GCIP forces response_mode=form_post)
2. open authUri in the system browser → Apple consent → form_post to the gateway bridge
3. the bridge navigates the browser to houston://auth-callback?<the same params as a query>
   (stateless POST→GET conversion, no secrets) → the OS routes the deep link to the app;
   the Rust shell forwards it onto the same `auth://deep-link` event the loopback flows use
   (lib.rs → auth::is_auth_callback_deep_link)
4. CSRF: the `state` GCIP embedded in authUri is enforced on the callback
   (parseCallbackQuery); stale/foreign callbacks are ignored, exactly like PKCE
5. accounts:signInWithIdp({ requestUri: <bridge URL>?<query>, sessionId }) → Firebase session
   (the Apple client secret lives ONLY in the identity project's provider config)
```

- **Web** uses the ordinary popup: `signInWithPopup(new OAuthProvider("apple.com"))` with
  `email` + `name` scopes (`packages/web/src/identity/firebase-popup.ts`). Apple returns the
  user's name/email only on the FIRST consent per Services ID.
- No new baked env vars — the bridge URL derives from the gateway URL the client already has
  (`auth-gateway.ts` `gatewayUrl()`).
- The button renders UNCONDITIONALLY, exactly like Google and Microsoft. There is no flag:
  the old enable gate kept the shipped button invisible for months and was deleted per the
  "features default ON" rule.

**One-time human setup (open):** an Apple Developer App ID + **Services ID** whose return
URLs are the GCIP handler (web popup) AND the gateway bridge (desktop), team ID, key ID +
private key → the `apple.com` provider config; the gateway domain added to the identity
project's **authorized domains** so `createAuthUri` accepts the bridge `continueUri`; and
the gateway's `POST /v1/auth/apple/return` bridge endpoint shipped.

## Google / Microsoft — web (firebase-js-sdk popup)

`packages/web/src/identity/firebase-popup.ts`: `initializeApp` + `getAuth` +
`browserLocalPersistence`, then `signInWithPopup(GoogleAuthProvider)` /
`signInWithPopup(new OAuthProvider("microsoft.com"))`. The SDK owns persistence +
auto-refresh; `onIdTokenChanged` mirrors the live token into the engine global and the
`["session"]` cache (`cloud-login.tsx`). A cancelled popup resolves `null`. No redirect
bridge, no `detectSessionInUrl`.

## Email OTP (6-digit) — all surfaces

GCIP has no native 6-digit OTP, so the **gateway owns it** and hands back a GCIP **custom
token** the client exchanges for a normal Firebase session (`app/src/lib/identity/otp.ts`,
the pinned contract of record):

```
POST {gateway}/v1/auth/email-otp/start   { email }        → 204   (gateway emails a code)
POST {gateway}/v1/auth/email-otp/verify  { email, code }  → 200 { customToken }
                                                             401 → otp_invalid_code
                                                             429 → otp_rate_limited
signInWithCustomToken(customToken)   (REST on desktop, SDK on web) → Firebase session
decodeIdTokenClaims(idToken) fills uid/email/name → Session (provider: "custom")
```

The gateway base URL is the engine URL the client already has (`auth-gateway.ts`
`gatewayUrl()` → `resolveEngine` / `window.__HOUSTON_ENGINE__.baseUrl`; a typed throw when
none is configured, never a silent no-op).

## iOS (native) — `mobile/ios/Houston/Core/Auth/`

The iOS app is a **REST GCIP client like the desktop** (zero-third-party-packages policy, so
no firebase-ios-sdk). Four ways in, all landing on the same `AuthSession` (Firebase ID token
= the gateway bearer, Keychain-persisted, proactive + on-demand refresh via securetoken):

- **Apple (native)** — SwiftUI `SignInWithAppleButton` →
  `ASAuthorizationAppleIDCredential.identityToken` + a nonce pair (SHA-256 hex to Apple, raw
  to GCIP) → `signInWithIdp(apple.com)` (`AuthController+Apple.swift`, `AppleNonce.swift`).
  Fully native: no Services ID or secret, only the `apple.com` IdP enabled
  (`cloud/infra/terraform/identity.tf`) and the Sign in with Apple capability on the App ID.
  App Store guideline 4.8 makes it mandatory alongside Google. Apple returns the user's name
  only on FIRST authorization — carried into the session as a fallback display name.
- **Google** — `ASWebAuthenticationSession` + PKCE (S256) against an **iOS-type OAuth
  client** (public, secret-less; redirect = the reversed-client-ID scheme), token exchange,
  `id_token` → `signInWithIdp(google.com)` (`OAuthCodeFlow.swift`, `ProviderSpecs.swift`).
  Deliberately NOT the desktop's installed-app client, which carries a baked secret.
- **Microsoft** — same `OAuthCodeFlow`, Entra `common` tenant public client, redirect
  `houston://auth-callback` (listed under the Azure app's "Mobile and desktop applications").
- **Email code** — the same gateway OTP contract → `signInWithCustomToken`; identity from
  decoded ID-token claims (`EmailOtpClient.swift`, `IdTokenClaims.swift`).

**Open human step:** `mobile/ios/Houston/App/Config.swift` still ships EMPTY
`googleIOSClientID` (`:31`) and `microsoftClientID` (`:36`). While empty those two buttons
surface the `providerDisabled` copy (never a silent no-op); Apple and the email code work
without them. Also owed: `houston://auth-callback` on the Azure app's mobile redirect URIs,
the Sign in with Apple capability on App ID `com.gethouston.Houston`, and the App Store
Connect app record + `APPLE_TEAM_ID` secret for the TestFlight lane
(`.github/workflows/ios-testflight.yml`).

Errors map once to the desktop taxonomy (`IdentityError.swift` mirrors `identity/errors.ts`;
`AuthErrorCopy.swift` mirrors `auth-errors.ts`; copy mirrors `errors:auth.*` in en/es/pt).
Wire shapes are pinned by `HoustonTests/Auth/*` against `identity/firebase-rest.ts`.

## Admin (`/admin`) — email/password + Google popup

The operator dashboard (`packages/web/src/admin/*`) is self-contained: it can't reach the
desktop Keychain, so it does NOT use `identity/refresh.ts` / `session-store.ts`.

- `admin/auth.ts` (pure, tested) + `admin/use-admin-auth.ts`: email/password via REST
  `signInWithPassword`, Google via the web popup; both yield
  `AdminSession { idToken, refreshToken, expiresAt, email }`.
- A single proactive `refreshIdToken` timer keeps the bearer fresh (terminal-vs-transient
  like `refresh.ts`); the session persists to localStorage for reload survival. The live
  `idToken` is the control-plane bearer.
- **GCIP email/password IS enabled** — `cloud/infra/terraform/identity.tf:21-23` carries
  `sign_in { email { enabled = true, password_required = true } }`, provisioned for
  operator/admin accounts only (the product's end-user email flow is the OTP above).
- The operator allowlist (`CP_ADMIN_USER_IDS`) is the real gate, enforced gateway-side; the
  UI just shows the 403/404 reason. Admin accounts are provisioned out-of-band.

## Session + Keychain model

`Session = { idToken, refreshToken, uid, email, emailVerified, displayName, photoUrl,
provider, expiresAt }`, `provider ∈ google.com | microsoft.com | apple.com | password |
custom` (`identity/session.ts`).

| Piece | Where |
|---|---|
| Session JSON blob | CI releases: Keychain service `com.houston.app.auth`, key `houston-auth` (Windows: DPAPI file; Linux: Secret Service, falling back to a 0600 file under `~/.local/share/com.houston.app/auth/` when no daemon is reachable) |
| PKCE code verifier | **In memory** for the flow — desktop owns both ends of the loopback |
| Storage adapter | `identity/session-store.ts` → os-bridge `osAuthGetItem/SetItem/RemoveItem` → Tauri `auth_*` cmds (`app/src-tauri/src/auth.rs`) |
| Local dev storage | Browser storage, worktree-scoped key `houston-auth-local-<hash>` |
| Rust dep | `keyring = "3"` (`apple-native` + `windows-native` + `sync-secret-service`/`crypto-rust`/`vendored` for Linux — WITHOUT a Linux feature the crate silently compiles an in-memory mock and sessions vanish on quit, which shipped in AppImages ≤0.5.20) |

- `session-store.ts` reuses the `houston-auth` key, so an upgrading user may hold a stale
  legacy (pre-GCIP) blob. `deserializeSession` (`identity/session.ts:124`) runs
  `isSessionShape` and treats any non-Firebase shape or unparseable JSON as signed-out:
  discard + log, never throw, never silently accept. Override the backend with
  `HOUSTON_AUTH_STORAGE=keychain|browser`.
- **Read fault ≠ signed out.** A keychain READ that *fails* (locked keychain, denied prompt,
  a stale item ACL after an auto-update re-signs the app) is NOT "no entry". The KV adapter
  (`session-storage-kv.ts`) returns a discriminated `ReadResult` (`{ok:true,value}` vs
  `{ok:false,error}`) — the Rust side already distinguishes `NoEntry → Ok(None)` from
  `Err(...)` (`auth.rs`), so a rejected `osAuthGetItem` is a fault. *(Linux caveat: `auth.rs`
  catches a secret-service fault and falls back to the file store, so a daemon fault with no
  fallback file still reads as absence there.)*
- The pure loader (`session-load.ts` `createSessionLoader`) maps a fault to
  `loadSessionState() → { kind: "unavailable" }` and — critically — does **NOT** `notify(...)`
  (a null broadcast would flip every `subscribeSession` subscriber to signed-out).
  `loadSession()` stays a collapsed `Session | null` wrapper for the refresh paths.
- On a **successful** keychain read, once per app run, the loader re-saves the same blob so
  the macOS keychain item's ACL **rebinds to the current code signature** — the permanent fix
  for "logged out after update". That maintenance write's failure is logged, never thrown,
  never affects the result.
- Three files keep `loadSessionState` inside the 200-line limit: `session-storage-kv.ts`
  (adapters + `ReadResult`), `session-load.ts` (pure orchestration, unit-tested via injected
  deps), `session-store.ts` (app API + epoch + pub/sub).
- **`useSession`** (`app/src/hooks/use-session.ts`) is the TanStack source of truth
  (`SESSION_QUERY_KEY = ["session"]`): desktop reads the Keychain via `loadSessionState` and
  mirrors `subscribeSession` broadcasts; web awaits the first `onIdTokenChanged` so a
  returning user never flashes signed-out. A desktop read fault throws
  `SessionUnavailableError` into the query (retried 3× on a 1s/2s/4s backoff); once retries
  exhaust, `App.tsx` and `HostedEngineGate` render **`StorageUnavailableScreen`**
  (`app/src/components/auth/storage-unavailable-screen.tsx`, copy
  `errors:auth.storageUnavailable{Title,Body,Retry}` in en/es/pt) instead of `SignInScreen` —
  a fault must never look like a logout. That component reads the i18n singleton directly
  rather than `useTranslation`, because the web EngineGate renders gate states outside
  `<I18nextProvider>`. `App.tsx` renders `SignInScreen` only when
  `isIdentityConfigured() && !session` with no error.
- **Web boot timeout.** `loadWebSession`'s 10s belt-and-suspenders timeout does not blindly
  resolve `null`: it asks the SDK via `webCurrentSession()` (`getAuth().currentUser →
  toSession`, mirrored in the desktop stub) and resolves the real persisted session when one
  exists, only resolving `null` when the SDK confirms no user.

## Refresh

- `identity/refresh.ts` owns `refreshNow()` (single-flight), which backs
  `window.__HOUSTON_SESSION_REFRESH__` for the gateway 401 seam — no engine-adapter change.
- `identity/refresh-timer.ts` runs the proactive timer that refreshes ~5 min before
  `expiresAt` (`REFRESH_SKEW_MS`), with exponential backoff on transient failures so an
  offline token inside the skew window can't hot-loop the securetoken endpoint. Firebase
  refresh tokens are long-lived and not rotated.
- A terminal refresh failure (revoked/expired refresh token, disabled or deleted account)
  resolves `null` → a real sign-out surfaced by the auth gate; a transient throw is logged and
  treated as `null` so the 401 surfaces rather than crashing the refresher. On web the
  firebase-js-sdk owns refresh; `webRefreshIdToken` force-mints a fresh token for the same seam.
- **The epoch fence (a refresh must never resurrect a signed-out session).** `doRefresh`
  samples `sessionEpoch()` **before** `loadSession()` — not after — and re-checks it before the
  save AND again after it. `loadSession()` is itself async (a keychain round-trip), so sampling
  after the read would miss a sign-out that landed DURING it; the refresh would then re-save the
  blob sign-out just deleted and `sessionSink` would snap the UI back into the old account. Any
  epoch change abandons the refresh.
- **The post-save compensation is CONDITIONAL**, and that condition is load-bearing. When the
  epoch moved during the write, the refresh re-clears only if the blob on disk is still the one
  it just wrote (`peekSession()` — a read that deliberately does NOT broadcast; compared on
  `idToken`). In that window a DIFFERENT account can already have signed in, and an
  unconditional clear would delete the NEW user's session. A read fault resolves `null`, which
  correctly reads as "not provably ours, leave it".

## Sign-out

`signOut()` lives in **`app/src/lib/sign-out.ts`** (re-exported from `lib/auth`, which stays
the one auth front door). Order matters, and every step that can reject is contained so local
cleanup ALWAYS completes:

```
cancelAllConnectFlows()                    // no gateway polls as a user who has left
cancelPendingAuthorize()                   // free the loopback port + kill a pending attempt
stopProactiveRefresh() + clearSession()    (desktop) | webSignOut()  (web)
purgeAccountLocalState(window.localStorage)  // contained: a rejection must not skip the reset
analytics.track + analytics.reset()
resetForIdentityChange() + forgetActiveIdentity() + cacheSession(null)
→ if the clear failed: emitAuthError("session_clear_failed") + throw typed
```

- **Sign-out DOES purge account-scoped `houston.*` localStorage.**
  `purgeAccountLocalState` (`app/src/lib/houston-local-state.ts:56`) removes every `houston.*`
  key EXCEPT the four device-local prefixes (`DEVICE_LOCAL_KEY_PREFIXES`, `:44`):
  `houston.web.engine`, `houston.web.agents`, `houston.web.agentfile:`,
  `houston.pendingAgentMoves`. Account prefs, layouts, read cursors, agent colours and the
  last-sign-in hint all go.
- `clearSession()` (`identity/session-store.ts`) **retries a failed delete once**, then throws
  `IdentityError("session_clear_failed")` — a surviving Keychain blob is what silently signed
  users back into the account they just left on the next launch. It still broadcasts
  signed-out first: locally the session IS gone. `signOut()` surfaces the failure and rethrows;
  the two callers (`user-menu.tsx`, `settings/sections/account.tsx`) only log, because the bus
  already owns the visible surface.
- **The two cleanups are reported DISTINCTLY** (`lib/sign-out-failure.ts`, pure +
  unit-tested). A surviving persisted session means "you may still be signed in next launch"
  (`session_clear_failed` → `errors:auth.signOutIncomplete`); a surviving local cache means
  only "some lists may look stale", the login genuinely gone (`local_data_clear_failed` →
  `errors:auth.localDataIncomplete`). Collapsing the second into the first told users their
  login had persisted when it had not. When both fail the session clear wins the report.
- The session-cache writer (`cacheSession` + the identity-change guard) lives in
  `app/src/lib/session-cache.ts` so sign-in and sign-out share one writer; the post-success
  path (persist, remember-last-sign-in, arm refresh, analytics pair) is
  `app/src/lib/sign-in-establish.ts`. The desktop hosted-mode **engine bearer clears
  reactively**: `cacheSession(null)` → `["session"]` null → `HostedEngineGate` effect calls
  `setHostedEngineSessionToken(null)`.

### Account deletion (HOU-991) — sign-out's stronger sibling

- `deleteAccountAndSignOut()` (`app/src/lib/delete-account-flow.ts`) is the client side of
  `DELETE {gateway}/v1/me` (contract `cloud/docs/contracts/C12-account-deletion.md`): the
  gateway purges every piece of hosted data (GCS, secrets, Composio, the org namespace, the
  GCIP user, then Postgres) for the caller's PERSONAL org, and refuses with `409 team_member`
  (deleting nothing) while the user still belongs to team spaces.
- The wire client is `identity/delete-account.ts` — the same live-bearer +
  one-refresh-replay idiom as `cloud-migration-transport.ts`.
- After the 204 the teardown always runs to the end and is deeper than sign-out's:
  `purgeHoustonLocalState` (`houston-local-state.ts:17`) removes **every** `houston.*` key,
  device-local ones included, then the full `signOut()` lifecycle finishes the device.
- The on-disk `~/.houston` tree is deliberately NOT touched — those are the user's
  machine-local files; deletion removes the hosted account and hosted data only.
- Surface: `settings/sections/delete-account.tsx` (Danger zone, type-to-confirm).
  Availability = identity configured + session + (hosted gateway engine, or web): in
  local-sidecar desktop mode `window.__HOUSTON_ENGINE__` is the co-located host, so there is
  no gateway to delete against. Other signed-in devices converge via the deleted-account
  terminal path: their next token refresh gets `USER_NOT_FOUND` → terminal sign-out.

## The identity boundary — `app/src/identity-keyed-app.tsx`

**This is the real boundary, in every deployment mode.** `IdentityKeyedApp()` (`:24`) is
four lines: `useSession()`; while `isPending` render `<WorkspaceLoading />`; else
`<App key={session.data?.uid ?? "signed-out"} />`.

- Keying `<App/>` by uid means ANY identity change — sign-out, sign-in, or an **in-place A→B
  switch that never passes through null** — unmounts and re-bootstraps the whole subtree:
  App's `bootedRef` boot-splash latch, `useHoustonInit`'s run-once guard, and every
  store-backed screen start clean. Holding the splash until the session query settles keeps
  the key stable from App's first mount.
- `HostedEngineGate` (`app/src/components/shell/engine-gate.tsx`) unmounts App on session
  loss **only in hosted-oauth builds**. Static-host (`pnpm dev`, self-host with cloud
  identity) and sidecar builds keep App mounted through App's own internal sign-in guard —
  which left the in-place reset with emptied stores and spent init guards (blank shell /
  false first-run on re-sign-in). `IdentityKeyedApp` is the one boundary that holds
  everywhere.
- Wiring: `app/src/main.tsx:170` renders it inside `EngineGate > QueryPersistenceProvider >
  LanguageGate > DisclaimerGate`; `packages/web/src/app-tree.tsx:195` mirrors it.

### Identity reset — in-place, no cross-account bleed (HOU-903)

`resetForIdentityChange()` (`app/src/lib/identity-reset.ts`), called from `cacheSession` on a
uid change and from `signOut`, wipes the client-side world so the incoming account never
inherits the outgoing one's memory. Its steps, in order:

1. `resetQueryCacheForIdentityChange(queryClient)` — **`removeQueries` with the `["session"]`
   root EXEMPTED**, plus a mutation-cache clear (`app/src/lib/identity-cache-reset.ts`,
   mirroring `SPACE_INVARIANT_KEY_ROOTS` in `space-cache.ts`).
2. `resetIntegrationGateForIdentityChange()`.
3. The zustand stores: `agents`, `workspaces`, `ui`, `drafts`, `agent-provisioning` — they
   live outside React and survive the sign-out unmount.
4. `setActiveOrg(null)` — a stale team slug would ride the next account's first requests and
   403 `not_member`.

> **`queryClient.clear()` is BANNED here (PRODUCT-1235).** `clear()` destroys the `Query`
> object while `HostedEngineGate` / `IdentityKeyedApp` / `App` observers are attached; the
> next `setQueryData` builds a replacement query with zero observers, the gates have no other
> render trigger, and the app freezes on the sign-in screen until relaunch.

This is a client-side stale-memory wipe only — the gateway is the sole tenancy enforcer and
never serves cross-tenant data.

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
| `session-storage-kv.ts` | Keychain/browser KV adapter; `ReadResult` (read fault ≠ absence); `storageKey` / `isKeychainMode` |
| `session-load.ts` | Pure `createSessionLoader` — `ReadResult` → `SessionLoadState`, notify decision, once-per-run ACL rebind |
| `session-store.ts` | App persistence API (`loadSessionState`/`loadSession`/`peekSession`/`save`/`clear`, clear retries once then throws typed) + `subscribeSession` + epoch + `SESSION_QUERY_KEY` |
| `refresh.ts` | `refreshNow` (401 seam, single-flight, epoch-fenced), `setSessionSink`, and the `window.__HOUSTON_SESSION_REFRESH__` install |
| `refresh-timer.ts` | Proactive timer + transient backoff; `start/stopProactiveRefresh` |
| `desktop-oauth.ts` | Loopback+PKCE driver (Tauri wiring); shared by Google + Microsoft |
| `brokered-loopback.ts` | The GCIP-brokered LOOPBACK driver (Microsoft): `createAuthUri` per candidate port, exact-port bind, `signInWithIdpSession` |
| `brokered-authorize.ts` | The GCIP-brokered DEEP-LINK driver (Apple) — no loopback listener at all |
| `apple-authorize.ts` | Apple's `createAuthUri` + bridge `continueUri` specifics (the pinned desktop-Apple contract) |
| `apple-return.ts` | Parsing the bridge's `houston://auth-callback` query back into a `signInWithIdp` request |
| `deep-link-listen.ts` | The one `auth://deep-link` subscriber both drivers inject |
| `token-exchange.ts` | `postTokenForm` — the provider token-endpoint POST (Google + Microsoft) |
| `oauth-attempt.ts` | Tauri-free attempt lifecycle (supersede / cancel / timeouts / ignore-foreign-state) — unit-testable |
| `oauth-attempt-contract.ts` | The injected seams (`DeepLinkListen`, `AwaitCallbackParams`) + both timeout policies (`CALLBACK_TIMEOUT_MS`, `BROWSER_OPEN_TIMEOUT_MS`, `withBrowserOpenDeadline`) |
| `oauth-callback.ts` | Pure callback parser: CSRF `state` validated first; `isCsrfStateMismatch` predicate |
| `pkce.ts` | Code verifier / S256 challenge / state |
| `google-authorize.ts` / `microsoft-authorize.ts` | Provider authorize + token-exchange specifics |
| `desktop-signin.ts` | `google/microsoft/customToken DesktopSession` — authorize → REST → Session |
| `session-from-idp.ts` | `IdpSignInResult` → `Session` |
| `delete-account.ts` | `DELETE {gateway}/v1/me` with the live-bearer + one-refresh-replay idiom |
| `log.ts` | node-test-safe log seam (`setIdentityLogSink` / `identityLog`) |
| `index.ts` | Barrel |
| `firebase-popup-stub.ts` | Desktop stub for `@houston/web-identity` (each export throws) — keeps firebase out of the desktop bundle |

Web-only: `packages/web/src/identity/firebase-popup.ts` (the real firebase-js-sdk surface,
aliased as `@houston/web-identity`) + `firebase-errors.ts` (SDK error → `IdentityError`
mapping, benign-popup-cancel detection).

## Error surfacing (no silent failures)

- Every sign-in failure is classified ONCE into an `IdentityErrorCode` (`identity/errors.ts`)
  and collapsed to a localized copy bucket by `app/src/components/auth/auth-errors.ts`
  `authErrorKey()` — an exhaustive `Record<IdentityErrorCode, …>`, so a new code fails to
  compile until bucketed. The `errors.auth.*` keys exist in en / es / pt.
- OAuth failures AFTER the browser hands off (provider rejection, code-exchange failure)
  arrive on the `auth-error-bus` (`onAuthError`) and render on `SignInScreen`; email-OTP
  errors render inline in `EmailSignIn` (emitted with `emit:false` to avoid a double render).
- Three codes are client-side lifecycle failures rather than GCIP responses:
  `session_clear_failed` → `auth.signOutIncomplete`, `local_data_clear_failed` →
  `auth.localDataIncomplete`, `browser_open_timeout` → `auth.signInTimeout`.
- **The bus holds an unheard emit** (`auth-error-bus.ts`). A sign-out failure is emitted while
  `SignInScreen` is not mounted — that screen mounts as a RESULT of the sign-out, a render
  later — so with no listener the code is parked and handed to the first subscriber arriving
  within 10s; anything older is dropped. This is also why sign-out does NOT toast: the toaster
  lives inside `<App/>`, which unmounts on sign-out.
- The identity log seam (`identity/log.ts`) is wired to the app logger by
  `initFrontendLogging()` (`app/src/lib/logger.ts`), called at startup by BOTH entrypoints —
  `app/src/main.tsx` (desktop) and `packages/web/src/app-tree.tsx` (web) — and by
  `packages/web/src/admin/dashboard.tsx` (the `/admin` entry, which does not go through
  app-tree). Until a sink is set the seam falls back to `console`, never silent.

## Gating + offline

- `isIdentityConfigured()` (baked `FIREBASE_API_KEY` && `FIREBASE_PROJECT_ID`) is the master
  switch. Unconfigured builds skip auth entirely — local dev without secrets still boots.
- `App.tsx`: splash while `useSession()` loads, `SignInScreen` once it resolves to `null`, the
  app otherwise.
- A cached Keychain session serves `loadSession()` offline; an unrefreshable token degrades
  gracefully (identical to signed-in-but-stale), it does not kick the user.

## Desktop hosted mode + the OAuth toggle (HOU-611)

The desktop app talks to the managed gateway when `VITE_HOSTED_ENGINE_URL` is set; there the
bearer is the Firebase ID token, fed to the engine client via `setHostedEngineSessionToken`
(`app/src/lib/engine.ts`) from the `useSession` → `HostedEngineGate` reactive path. Whether
that sign-in gate runs is `VITE_HOSTED_ENGINE_AUTH` (`app/src/lib/engine-mode.ts`):

| `VITE_HOSTED_ENGINE_AUTH` | Behavior |
|---|---|
| unset (hosted URL set) | **`oauth`** — sign-in required (managed-cloud default) |
| `oauth` / `google` / `1` / `true` / `on` (legacy alias `supabase`) | sign-in required |
| `static` / `token` / `none` / `0` / `false` / `off` | no login — hosted URL + static bearer (`VITE_HOSTED_ENGINE_TOKEN`), for service-token smoke tests |

Hosted OAuth needs a baked Firebase project. A build that turns OAuth on without one can never
obtain a token, so `HostedEngineGate` renders a loud "Sign-in required" screen
(`shell:engineGate.authRequired*`) instead of spinning forever. Signed cloud desktop builds
ship on the `cloud-v*` release channel.

### Testing sign-in against the local kind gateway

Bake the Firebase project into the dev build — in `app/.env.local`:

```
FIREBASE_API_KEY=<web-api-key>
FIREBASE_AUTH_DOMAIN=gethouston.firebaseapp.com
FIREBASE_PROJECT_ID=gethouston
GOOGLE_DESKTOP_CLIENT_ID=<desktop-oauth-client-id>
GOOGLE_DESKTOP_CLIENT_SECRET=<installed-app-secret>
VITE_HOSTED_ENGINE_URL=http://localhost:9080
# VITE_HOSTED_ENGINE_AUTH defaults to oauth when the hosted URL is set;
# set it to `static` (+ VITE_HOSTED_ENGINE_TOKEN) to test the no-login path.
```

Bring the gateway up (`make kind-up` in `cloud/`) with its Firebase issuer/JWKS env set, then
`pnpm tauri dev` in `app/` → sign in → the verified Firebase ID token reaches the gateway,
which provisions your per-user pod. Dev builds sign in with the passwordless email code: the
loopback opens the SYSTEM browser and a Google/Microsoft consent redirect can land in the
installed prod app, so the OAuth buttons are prod-only there (HOU-642).

## Config / secrets matrix

All Firebase web values are **public by design** (the apiKey is not a secret — access is gated
by GCIP provider config + the gateway allowlist), so they are baked into the bundle at build
time.

| Var | Baked as (Vite `define`) | Source / notes |
|---|---|---|
| `FIREBASE_API_KEY` | `__FIREBASE_API_KEY__` | Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | `__FIREBASE_AUTH_DOMAIN__` | e.g. `gethouston.firebaseapp.com` (web popup domain) |
| `FIREBASE_PROJECT_ID` | `__FIREBASE_PROJECT_ID__` | `gethouston` — token issuer/audience |
| `GOOGLE_DESKTOP_CLIENT_ID` | `__GOOGLE_DESKTOP_CLIENT_ID__` | Google "Desktop app" OAuth client (loopback + PKCE) |
| `GOOGLE_DESKTOP_CLIENT_SECRET` | `__GOOGLE_DESKTOP_CLIENT_SECRET__` | Non-confidential installed-app secret; the code→id_token exchange runs in TS |

- **There is no Microsoft define.** Desktop Microsoft is GCIP-brokered, so no client id or
  secret ships. (An orphaned "Desktop-only: the Microsoft (Entra) …" comment survives at
  `app/vite.config.ts:94` above an unrelated define — ignore it.)
- Both configs also bake `__HOUSTON_AUTH_STORAGE_MODE__` / `__HOUSTON_AUTH_STORAGE_SCOPE__`
  (hardcoded `"browser"` / `"web"` in `packages/web/vite.config.ts`), plus
  `__APP_VERSION__`, `__POSTHOG_*__`, `__SENTRY_DSN__`.
- **Dev override (no rebuild):** `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` /
  `VITE_FIREBASE_PROJECT_ID` (`import.meta.env`). See `app/src-tauri/.env.example` + the
  repo-root `.env.example`.
- **Baked in both bundles:** `app/vite.config.ts` + `packages/web/vite.config.ts` (auth-domain
  defaults `gethouston.firebaseapp.com`, project defaults `gethouston`).
- **Release CI:** `.github/workflows/release.yml` sets them from GitHub Secrets in each of the
  three Tauri build blocks (macOS / Windows / Linux).
- **Web image:** `packages/web/Dockerfile` documents the `FIREBASE_*` build args (the SPA
  config bakes at `pnpm --filter houston-web build`; the image just serves `dist`).

## PostHog identity

- Anonymous launch: `distinct_id = install_id` (`install-id.ts`).
- Sign-in: `analytics.alias(firebaseUid, { email, name })` — merges pre-signup history onto
  the identified user; the person property is `firebase_uid`.
- Sign-out: `analytics.reset()` — future events use a fresh anonymous id.
- **Discontinuity:** the uid is the Firebase uid, not the retired Supabase id, so historical
  joins keyed on `supabase_user_id` do not stitch to post-cutover persons. Accepted,
  intentional.

## Supabase that deliberately stays (do NOT "finish" the migration)

- **The website download gate.** `website/src/assets/download-gate-form.js:155` does an anon
  `POST {supabaseUrl}/rest/v1/waitlist` with the public anon key — a pure data write, no auth
  session, no gateway link. The Supabase project stays alive to serve it.
- **Server-side JWT-verification config.** `packages/host/src/config.ts:14-16` still carries
  `supabaseJwksUrl` (`CP_SUPABASE_JWKS_URL`), `supabaseJwtSecret` (`CP_SUPABASE_JWT_SECRET`)
  and `supabaseJwtIssuer` (`CP_SUPABASE_JWT_ISSUER`). The issuer/JWKS swap is a `cloud/` Go
  change; the Go gateway is authoritative.
- **`VITE_HOSTED_ENGINE_AUTH=supabase`** remains a legacy alias for `oauth`
  (`app/src/lib/engine-mode.ts:104`) — an env-value compatibility alias, not live Supabase.
- **Legacy Keychain blob tolerance** — `deserializeSession` discards any non-Firebase shape
  (see Session model above).

## Profiles + avatars — LANDED, gateway-backed

The gateway stores display identity and serves it two ways: `GET /v1/org/profiles?ids=<csv>`
(co-members of the active space, backing `useUserProfiles` /
`app/src/hooks/queries/use-user-profiles.ts`) and `GET`/`PUT /v1/me/profile`
(`packages/web/src/engine-adapter/cp/me-profile.ts`) for the caller's own display name +
photo. The photo is cover-cropped browser-side to 256px and sent as a capped data URI
(`app/src/lib/avatar-image.ts`; surface
`app/src/components/settings/sections/profile-photo.tsx`). Full picture:
**`mission-attribution.md`**. *(The Agent Store has its own separate creator-profile path,
`PATCH /v1/agentstore/me/profile` + a real multipart avatar upload.)*

> Stale code comment to clean up when next in the file:
> `app/src/hooks/use-my-profile.ts:16-19` still calls `useUserProfiles` a stub.

## Out of scope

- Server-side emitting PostHog events directly — the frontend covers Houston's event surface.
  **The engine receives no user-id env at spawn**; no `HOUSTON_APP_USER_ID` exists anywhere.
  Add an envelope carrier if a server-side consumer ever needs the uid.

## Teams / orgs

Orgs, roles (owner/admin/user), per-agent access and C8 Spaces ship in the paid hosted cloud;
the **gateway** owns and enforces all of it (org membership lives in the gateway's Postgres,
not the identity project). The open repo carries only the capability-gated client surface —
`knowledge-base/teams.md` + `knowledge-base/spaces.md`. Server contracts:
`cloud/docs/contracts/C3-org-role-model.md`, `C7-teams.md`, `C8-spaces-billing.md`.

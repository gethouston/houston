# Client-side auth migration — Supabase → GCP Identity Platform (Firebase Auth, project `gethouston`)

Implementation contract + living record. **Scope decision (resolves §6.3):** ALL
THREE sign-in methods ship — Google, Microsoft, and 6-digit email OTP — on GCIP.
Email OTP is delivered by a NEW gateway flow that returns a GCIP **custom token**
(there is no native 6-digit OTP in Firebase); see §2d + §6.3.

**Wave 1 (foundation) — LANDED.** The provider-agnostic client foundation lives
at `app/src/lib/identity/` (config, session, errors, firebase-rest, id-token,
otp, log), with the Vite `define` swaps + `vite-env.d.ts` declarations and
`node:test` unit tests under `app/tests/identity-*.test.ts`. No behavior is
wired yet — Wave 2 consumes these. See §5.

---

## 1. Current-state map

**Identity provider:** Supabase Auth, project ref `zfpnlvxazrataiannvtq` (`website/src/_data/env.js:11`). Google SSO, PKCE, `flowType: "pkce"` (`app/src/lib/supabase.ts:133`).

**One shared React app** (`app/src`) builds twice: the Tauri desktop shell and `packages/web` (verbatim, aliasing `packages/web/src/engine-adapter/index.ts`, `app/vite.config.ts:50`). Platform branches on `osIsTauri()`.

**Flows by surface:**

| Surface | Sign-in | Storage | Refresh |
|---|---|---|---|
| Desktop (Tauri) | `signInWithOAuth({provider, skipBrowserRedirect})` → system browser → **loopback** `127.0.0.1:<8975-8978>/auth/callback` (`app/src-tauri/src/oauth_loopback.rs:37`) → Rust emits `auth://deep-link` → JS `exchangeCodeForSession` (`app/src/lib/auth.ts:302`). Fallback: `houston://auth-callback` deep link. | macOS Keychain `com.houston.app.auth` / Windows DPAPI file, via `auth_get/set/remove_item` Tauri cmds (`app/src-tauri/src/auth.rs:218-234`), adapter `keychainStorage` (`supabase.ts:52`). PKCE verifier stored there too. | `supabase-js autoRefreshToken:true` |
| Web (`packages/web`) | `signInWithOAuth({redirectTo:${origin}/auth/callback})`, `detectSessionInUrl:true` (`auth.ts:99-108`, `supabase.ts:132`) | localStorage, worktree-scoped key (`auth-storage.ts`) | supabase-js |
| Admin (`/admin`) | Own Supabase client, `signInWithPassword` + Google popup (`packages/web/src/admin/dashboard.tsx:33,203,214`) | localStorage | supabase-js |

**Also live:** Microsoft/`azure` OAuth + passwordless **email OTP** (6-digit) (`auth.ts:71,173-214`, `sign-in-screen.tsx`). Email/OTP mail via Supabase templates.

**Token → gateway attach point (shared desktop+web).** The Supabase access token doubles as the gateway bearer.
- `CloudApp` mirrors the live session into `window.__HOUSTON_ENGINE__.token` on `onAuthStateChange`, and installs `window.__HOUSTON_SESSION_REFRESH__ = () => refreshSession()` (`cloud-login.tsx:39-62`).
- Desktop hosted mode feeds it via `setHostedEngineSessionToken` (`engine.ts:177`).
- The adapter reads the bearer **live per request** (`cp/context.ts` `liveToken`, `cp/fetch.ts:39,54-75`) and on a **401** runs one single-flight refresh + replay (`session-refresh.ts`, `cp/fetch.ts:69-73`). Header shape: `Authorization: Bearer <jwt>`, plus `x-houston-org` (unchanged).

**Gate:** `isAuthConfigured()` = `SUPABASE_URL && SUPABASE_ANON_KEY` baked as `__SUPABASE_URL__`/`__SUPABASE_ANON_KEY__` (`supabase.ts:138`, `app/vite.config.ts:63`). `App.tsx:194-201` renders `SignInScreen` when configured + no session. `useSession` (`hooks/use-session.ts`) is the TanStack source of truth; `current-user.ts` caches email for bug reports.

**Sign-out:** `supabase.auth.signOut()` + clear local data + `analytics.reset()` (`auth.ts:221`).

**Where the Google OAuth client lives today:** GCP Console → project (per `knowledge-base/auth.md:202-208`), Web-application client whose redirect URI is `https://<ref>.supabase.co/auth/v1/callback`; client id/secret pasted into the Supabase dashboard (NOT committed — `config.toml` only ships the disabled `apple` stub). **Confirm this client sits in GCP project `gethouston`** (§6 R1).

**Waitlist isolation (confirmed):** `website/src/waitlist/index.html:488` + `_includes/early-access/app.njk` do anon `POST /rest/v1/waitlist` and `/rest/v1/rpc/*` with the anon key — pure data writes, **no auth session, no gateway link**. Untouched by this migration; Supabase project stays alive for waitlist.

---

## 2. Target design per surface

**Gateway token shape:** a **Firebase ID token** (JWT), issuer `https://securetoken.google.com/gethouston`, aud `gethouston`, `sub` = Firebase UID. Same `Authorization: Bearer …` header, same `x-houston-org`. **No client-side contract change beyond the token's provenance** (§4).

**Decision — SDK per surface:**
- **Web + Admin → firebase-js-sdk** (modular `firebase/auth`). Browser env, `signInWithPopup`/`signInWithEmailAndPassword` work, localStorage persistence + auto-refresh are free, `onIdTokenChanged` mirrors into the engine global.
- **Desktop → thin REST client, NOT firebase-js-sdk.** Rationale: (1) the SDK's popup/redirect model fights the Tauri webview + loopback; (2) its persistence layer (indexedDB/localStorage) can't be pointed at the Keychain, breaking encrypted-at-rest; (3) a session can only be rehydrated across launches from Firebase's **refresh token** via `securetoken.googleapis.com` — which is REST anyway. Owning the REST calls keeps today's architecture intact (storage adapter + `__HOUSTON_SESSION_REFRESH__` seam already exist) and keeps the engine-adapter Supabase/Firebase-agnostic (auth ownership stays in the shell, per `session-refresh.ts:5`).

### 2a. Desktop (Tauri) — Google via loopback + GCIP REST

`app/src/lib/identity/firebase-rest.ts` (LANDED) — four `fetch` wrappers, each
throwing a typed `IdentityError` (taxonomy in `identity/errors.ts`) and
normalizing `expiresIn` (seconds string) → absolute `expiresAt` (epoch ms):
- `signInWithIdp({apiKey, providerId, idToken?, accessToken?})` — **generic**
  federated sign-in; `providerId` is `"google.com" | "microsoft.com"`. `POST
  identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=<apiKey>` body
  `{postBody:"id_token=<t>&providerId=<p>", requestUri:"http://localhost",
  returnSecureToken:true, returnIdpCredential:true}` → `{idToken, refreshToken,
  expiresAt, uid, email, emailVerified, displayName, providerId}`.
- `signInWithCustomToken({apiKey, customToken})` — the email-OTP final exchange
  (§2d); `accounts:signInWithCustomToken` → `{idToken, refreshToken, expiresAt}`.
  Returns no profile, so `identity/id-token.ts::decodeIdTokenClaims` reads
  `sub`/`email` from the ID token to assemble the `Session`.
- `refreshIdToken({apiKey, refreshToken})` → `POST securetoken.googleapis.com/v1/token?key=…`
  `grant_type=refresh_token` → `{idToken, refreshToken, expiresAt}`.
- `signInWithPassword({apiKey, email, password})` — admin only (§2c).

**Sign-in sequence:**
```
User clicks "Continue with Google" (SignInScreen, unchanged UI)
 → auth.ts signInWithGoogle():
    1. redirectUri = osStartOauthLoopback()            // reuse oauth_loopback.rs
    2. build Google authorize URL:
         accounts.google.com/o/oauth2/v2/auth?
         client_id=<VITE_GOOGLE_DESKTOP_CLIENT_ID>
         &redirect_uri=<loopback>&response_type=code
         &scope=openid email profile&code_challenge=<PKCE S256>&state=…
    3. tauriSystem.openUrl(authorizeUrl)
 → Google consent in system browser
 → 302 → 127.0.0.1:<port>/auth/callback?code=…&state=…
 → oauth_loopback.rs captures code, emits auth://deep-link, brings window to front
 → auth.ts completeAuthCallback():
    4. exchange code at oauth2.googleapis.com/token
         (client_id + GOOGLE_DESKTOP_CLIENT_SECRET + code_verifier) → google id_token
    5. firebase-rest.signInWithIdp(google id_token) → Firebase session
    6. persist session JSON to Keychain (auth_set_item "houston-auth")
    7. applySessionToCache(session) → gate flips, PostHog alias(localId)
```
`state` is validated against a value stashed at step 2 (CSRF). PKCE `code_verifier` held in memory for the flow (no Keychain round-trip needed — desktop owns both ends).

**Storage adapter:** keep `auth.rs` verbatim (Keychain/DPAPI, `auth_*` commands). Store one JSON blob `{idToken, refreshToken, uid, email, name, expiresAt}` under key `houston-auth`. New TS `identity/session-store.ts` wraps the `invoke("auth_*")` calls (moved out of `supabase.ts`).

**Refresh strategy:** a `identity/refresh.ts` timer refreshes ~5 min before `expiresAt` (replaces `autoRefreshToken`); it also backs `window.__HOUSTON_SESSION_REFRESH__` for the gateway 401 seam — **no engine-adapter change**. Firebase refresh tokens are long-lived and **not rotated** (simpler than Supabase; single-flight still kept, `session-refresh.ts` unchanged).

**Deep-link/loopback specifics:** `oauth_loopback.rs` is reused as-is (it already captures `?code=` and emits `auth://deep-link`); only the JS side changes what it does with the code (Google exchange, not Supabase). **As-built: the `houston://auth-callback` direct-OAuth fallback is RETIRED** (see As-built note (h)) — a loopback bind failure surfaces a typed error, not a custom-scheme redirect Google/MS would reject. Loopback ports `8975-8978` must be added as **Authorized redirect URIs on the Desktop OAuth client** (§3), not Supabase.

**Errors (no silent failures):** every REST call throws typed on non-2xx; caught in `completeAuthCallback` → `emitAuthError` → `SignInScreen` toast (`auth.ts:146`, `sign-in-screen.tsx:49`). Keychain failures rethrow exactly as today (`supabase.ts:65`). User-facing strings via `t()`.

**Offline:** cached Keychain session serves `getSession()`; token unrefreshable offline → degraded mode identical to today (`knowledge-base/auth.md:170`).

### 2b. Web (`packages/web`) — firebase-js-sdk popup

New `packages/web/src/identity/firebase.ts`: `initializeApp({apiKey, authDomain:"gethouston.firebaseapp.com", projectId:"gethouston"})`, `getAuth()`, `browserLocalPersistence`.
```
signInWithGoogle (web branch, auth.ts):
  signInWithPopup(auth, new GoogleAuthProvider())   // no redirect bridge needed
CloudApp:
  onIdTokenChanged(auth, u => apply(await u?.getIdToken()))   // → __HOUSTON_ENGINE__.token
  __HOUSTON_SESSION_REFRESH__ = () => auth.currentUser?.getIdToken(true) ?? null
```
The `gethouston.ai/auth/callback` relay bridge (`auth.ts:35`) and `detectSessionInUrl` are **retired** for web (popup returns in-page). SDK owns persistence + auto-refresh.

### 2c. Admin (`/admin`)

`dashboard.tsx`: own `getAuth()`; `signInWithEmailAndPassword(email, pw)` and Google `signInWithPopup`; bearer = `user.getIdToken()`. `api.ts` unchanged (still `Authorization: Bearer`). Operator allowlist stays gateway-side.

### 2d. Microsoft + email OTP (all surfaces)

**Microsoft** rides the SAME paths as Google, one provider id different:
- **Desktop:** the loopback + PKCE flow (§2a) against Microsoft's OAuth endpoint,
  then `signInWithIdp({providerId:"microsoft.com", idToken})`. Needs an Azure app
  registration whose redirect includes the desktop loopback ports (§6.3).
- **Web/admin:** `signInWithPopup(auth, new OAuthProvider("microsoft.com"))`.

**Email OTP (6-digit)** — GCIP has no native 6-digit OTP, so the **gateway owns
it** and hands back a GCIP **custom token** the client exchanges for a normal
Firebase session. Client module: `app/src/lib/identity/otp.ts` (LANDED).
```
Client POST {gateway}/v1/auth/email-otp/start  {email}        → 204   (gateway emails a code)
User types the 6-digit code
Client POST {gateway}/v1/auth/email-otp/verify {email, code}  → 200 {customToken}
                                                                 401 wrong/expired code
                                                                 429 rate limited
Client signInWithCustomToken({apiKey, customToken})           → Firebase session
decodeIdTokenClaims(idToken) fills uid/email/emailVerified/name → Session (provider:"custom")
```
The gateway base URL is the engine URL the client already has
(`window.__HOUSTON_ENGINE__.baseUrl` / `VITE_HOSTED_ENGINE_URL`). The
`email-otp/*` endpoints are built server-side in `cloud/` in parallel; `otp.ts`'s
module header is the pinned contract of record.

---

## 3. Gateway contract (cloud repo — separate PR)

Header/token shape: **unchanged** (`Bearer <jwt>` + `x-houston-org`). Only verification changes on the Go side (`cloud/internal/...`, authoritative per workspace CLAUDE.md):
- issuer `https://securetoken.google.com/gethouston`, aud `gethouston`, JWKS `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com` (Google public keys, cached by `Cache-Control`).
- `sub` = Firebase UID (opaque user id; fresh platform, no continuity).
- Update `cloud/INTEGRATION.md` (issuer contract). The kind smoke path (`GW_SUPABASE_JWKS_URL`) becomes a Firebase JWKS/issuer env.

This is a coordinated cross-repo change — land Houston client behind a build flag, or ship the gateway verifier accepting Firebase first.

---

## 4. Config / env changes

Replace everywhere `SUPABASE_URL`/`SUPABASE_ANON_KEY` appear:

| Old | New | Files |
|---|---|---|
| `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__` | `__FIREBASE_API_KEY__`, `__FIREBASE_AUTH_DOMAIN__`, `__FIREBASE_PROJECT_ID__` | `app/vite.config.ts:63`, `packages/web/vite.config.ts:69`, both `vite-env.d.ts` |
| — (desktop only) | `__GOOGLE_DESKTOP_CLIENT_ID__` (baked), `__GOOGLE_DESKTOP_CLIENT_SECRET__` (baked JS define, non-confidential installed-app secret — as-built: the code→id_token exchange runs in TS, not Rust env; see As-built note (a)) | new |
| `VITE_CP_SUPABASE_URL/ANON_KEY` | `VITE_CP_FIREBASE_*` (or reuse the same project config) | `admin/dashboard.tsx:21`, `packages/web/Dockerfile` |
| release env `SUPABASE_URL/ANON_KEY` | `FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID` + `GOOGLE_DESKTOP_CLIENT_ID/SECRET` + `MICROSOFT_DESKTOP_CLIENT_ID` | `release.yml` three Tauri build env blocks (macOS/Windows/Linux) + the header secret inventory. **As-built: SUPABASE_* fully REMOVED** (not kept alongside) — all three blocks build only the desktop app, which no longer reads SUPABASE_* after `supabase.ts` was deleted; the website waitlist does not build from `release.yml`, so nothing else there consumes them. |
| `app/src-tauri/.env.example:12` | firebase vars | |

`VITE_HOSTED_ENGINE_URL` / `VITE_HOSTED_ENGINE_AUTH` (`release.yml:341,1086,1363`) and the whole hosted-mode plumbing (`engine-mode.ts`, `engine.ts`) are **unchanged** — they carry a URL + an auth toggle, not Supabase specifics.

**Waitlist + early-access (`website/`): stay on Supabase.** No change. Isolated (§1). Document the intentional split so nobody "finishes" the migration by ripping out the website's Supabase.

`isAuthConfigured()` → `Boolean(firebaseApiKey && firebaseProjectId)`.

---

## 5. Work breakdown (file-disjoint waves)

**Wave 1 — Foundation (1 agent, serial; pins the contract). — LANDED.**
- `app/src/lib/identity/` (all files ≤161 lines):
  - `config.ts` — reads baked `__FIREBASE_*__` (+ `VITE_FIREBASE_*` dev override), `resolveIdentityConfig`, `identityConfigured`, `isIdentityConfigured()`.
  - `session.ts` — `Session = {idToken, refreshToken, uid, email, emailVerified, displayName, provider, expiresAt}` (`provider: "google.com"|"microsoft.com"|"password"|"custom"`) + `serializeSession`/`deserializeSession` (shape-tolerant: legacy Supabase blob / corrupt JSON → `null` + structured log, never throws) + `sessionExpiresWithin`.
  - `errors.ts` — `IdentityError` + the `IdentityErrorCode` discriminated union + `mapGcipCode` (GCIP code → stable code, mapped ONCE; downstream never string-matches).
  - `rest-client.ts` — transport core; the one place GCIP error bodies become typed errors.
  - `firebase-rest.ts` — `signInWithIdp` (generic), `signInWithCustomToken`, `refreshIdToken`, `signInWithPassword` (signatures §2a).
  - `id-token.ts` — `decodeIdTokenClaims` (decode-only; for the custom-token OTP path).
  - `otp.ts` — `startEmailOtp` / `verifyEmailOtp` (gateway contract §2d, pinned in the module header).
  - `log.ts` — a node-test-safe logging seam (`setIdentityLogSink` / `identityLog`); see the as-built note below.
- Vite `define` swaps (`__FIREBASE_API_KEY__` / `__FIREBASE_AUTH_DOMAIN__` / `__FIREBASE_PROJECT_ID__` / `__GOOGLE_DESKTOP_CLIENT_ID__`, kept ALONGSIDE `__SUPABASE_*__`) + `vite-env.d.ts` in `app/` and `packages/web/`.
- Tests: `app/tests/identity-*.test.ts` (`node:test`, the app package's CI-run runner — NOT vitest; see as-built note).
- *Accept (met):* `pnpm --filter houston-web typecheck` + `app` tsgo green; all identity units + full 1329-test app suite pass; biome clean; no behavior wired yet.

> **As-built notes (deviations, with reasons).**
> 1. **`node:test`, not vitest.** The app package's unit runner is `node --experimental-strip-types --test tests/*.test.ts` (what CI runs via `pnpm --filter houston-app test`); it has no vitest. A colocated vitest file would run in NO CI glob. So tests live at `app/tests/identity-*.test.ts` in `node:test`, matching every other app unit test.
> 2. **`.ts`-extension relative imports** inside `identity/` — required for the `node:test` runner to resolve modules (the established repo convention for unit-tested app modules, e.g. `standard-tabs.ts`).
> 3. **`log.ts` seam** instead of importing the app `logger` directly: the app logger transitively pulls the Tauri `os-bridge` graph, which the `node:test` runner can't resolve, so importing it would make the leaf parsers untestable. Wave 2 MUST call `setIdentityLogSink((l,m,c)=>logger[l](m,c))` once at startup so discards reach `frontend.log`; until then the seam falls back to `console` (never silent).

**Wave 2 — parallel, disjoint:** (2a **LANDED**; 2b/2c pending)
- **2a App identity wiring — LANDED.** As-built: the identity foundation is fully
  wired on both surfaces. Desktop uses loopback+PKCE → GCIP REST (`signInWithIdp`),
  session persisted to Keychain via `identity/session-store.ts`, proactive refresh via
  `identity/refresh.ts`; web uses firebase-js-sdk popup confined to
  `packages/web/src/identity/firebase-popup.ts` behind the `@houston/web-identity` alias
  (desktop aliases a stub — zero firebase in the desktop bundle). All three methods
  (Google, Microsoft via `microsoft.com`, email OTP via `otp.ts` + custom token) wire
  through the same modules. `supabase.ts` deleted; `__SUPABASE_*__` Vite defines removed
  with it; identity log sink registered at startup. See "As-built notes (Wave 2a)" below
  for the deviations, new defines, and the Rust contract Wave 2b must honor.
- **2b Rust loopback — LANDED.** `oauth_loopback.rs` audited against the pinned
  contract (note (c)): NO mismatch — it already returns
  `http://127.0.0.1:<port>/auth/callback`, forwards `?code=&state=` verbatim, and
  emits `auth://deep-link` with `houston://auth-callback?<query>`. Added the
  optional `cancel_oauth_loopback` improvement, retired the dead
  `houston://auth-callback` OS deep-link branch, refreshed Supabase-naming
  comments. See "As-built notes (Wave 2b)" below.
- **2c Admin — LANDED.** `packages/web/src/admin/*`: GCIP email/password (REST) +
  Google popup, Firebase ID-token bearer with proactive REST refresh. See
  "As-built notes (Wave 2c)" below — **incl. a HIGH infra gap: `identity.tf` does
  NOT enable the email/password sign-in method.**

> **As-built notes (Wave 2a) — deviations, new seams, and the Rust contract.**
>
> **(a) DEVIATION — Google secret + exchange live in TS, not Rust env.** Design §4
> placed `GOOGLE_DESKTOP_CLIENT_SECRET` in Rust env. Wave 2a instead bakes it as a JS
> `define` `__GOOGLE_DESKTOP_CLIENT_SECRET__`, and the code→id_token exchange runs in TS
> (`app/src/lib/identity/google-authorize.ts`) via `POST oauth2.googleapis.com/token`.
> Rationale: Wave 2b's `oauth_loopback.rs` stays a dumb loopback listener (its accept
> criteria say nothing about a token exchange); the secret is non-confidential (Google
> installed-app); keeping the exchange in TS makes it unit-testable.
>
> **(b) NEW define `__MICROSOFT_DESKTOP_CLIENT_ID__`.** Microsoft desktop is an Entra
> **public** client (PKCE, NO secret). Added to both vite configs + both `vite-env.d.ts`
> as `env.MICROSOFT_DESKTOP_CLIENT_ID ?? ""`. `microsoft-authorize.ts` guards empty →
> throws `IdentityError("operation_not_allowed")` (typed "provider not configured", no
> silent no-op). `__GOOGLE_DESKTOP_CLIENT_SECRET__` was added the same way.
>
> **(c) Rust assumptions for Wave 2b (implement against these — verbatim from the
> contract):**
> 1. `oauth_loopback.rs` `start_oauth_loopback` is reused AS-IS: returns
>    `http://127.0.0.1:<port>/auth/callback`, captures `?code=&state=`, emits
>    `auth://deep-link` with `houston://auth-callback?<query>`. Wave 2a's desktop-oauth.ts
>    depends on exactly this. Wave 2b must keep this event + query-forward contract (it may
>    broaden the success-page copy / provider-agnostic naming, but must NOT change the
>    redirect path `/auth/callback`, the `state` passthrough, or the `auth://deep-link`
>    event name/payload).
> 2. Rust needs NO client secret and NO token exchange (TS owns both).
> 3. `auth.rs` (Keychain `auth_get_item/auth_set_item/auth_remove_item`) unchanged —
>    session-store reuses it.
> 4. **OPTIONAL Wave 2b improvement — `cancel_oauth_loopback` command.** Today the Rust
>    loopback listener cannot be torn down from TS: on the JS side a superseded / cancelled
>    / timed-out attempt tears down its own `auth://deep-link` listener (see note (h)), but
>    the Rust listener keeps its port bound until its own 300s self-timeout. A late browser
>    completion then hits a dead JS listener and is harmlessly ignored. Wave 2b MAY add a
>    `cancel_oauth_loopback` command so TS can free the port immediately on cancel; not
>    required (the self-timeout already prevents a leak).
>
> **(h) DEVIATION — benign-cancel attempt model; `houston://auth-callback` direct-OAuth
> fallback RETIRED.** The desktop authorize (`identity/desktop-oauth.ts` +
> `identity/oauth-attempt.ts`) now treats supersession (a re-click), sign-in-screen unmount
> (`cancelPendingAuthorize()`), and the 300s timeout as BENIGN cancels — they resolve `null`
> (logged via `identityLog`, never an error toast), so an abandoned browser tab can no longer
> freeze the sign-in buttons or fire a minutes-later error. Buttons re-enable the instant the
> system browser opens (`onBrowserOpened`). Only a genuine callback error (provider `error`
> param, CSRF state mismatch, unreadable payload) still rejects typed. **As-built deviation
> from design §2a:** §2a said `houston://auth-callback` "stays the loopback-bind-failure
> fallback". It does NOT — Google/Microsoft reject custom-scheme redirect URIs on direct
> OAuth (guaranteed `redirect_uri_mismatch`), so a loopback bind failure now surfaces a typed
> `IdentityError("unknown", { rawCode: "loopback_bind_failed" })` for the generic retry UI
> instead of proceeding with an unusable redirect. Wave 2b may restore a fallback only by
> registering a provider-accepted reverse-DNS custom scheme.
>
> **(d) Web split.** firebase-js-sdk (`firebase@11.10.0`) is confined to
> `packages/web/src/identity/firebase-popup.ts` behind the `@houston/web-identity` Vite
> alias; the desktop config aliases `app/src/lib/identity/firebase-popup-stub.ts` (same
> symbols, each throwing) so the desktop bundle ships ZERO firebase. REST is used
> everywhere else (desktop sign-in + refresh, OTP, admin later).
>
> **(e) Profiles / avatar degradation.** The Supabase `profiles` table + avatar storage
> die with Supabase auth (RLS `auth.uid()` cannot match Firebase uids; uploads need a
> Supabase session that no longer exists). Wave 2a: `use-user-profiles.ts` is stubbed to
> return an empty map (keeps its signature + `USER_PROFILES_KEY`); the avatar-upload UI is
> removed from `account.tsx`; face stacks fall back to initials and self-face falls back to
> the session's `displayName`/`photoUrl`. The profile store moves to the gateway (follow-up).
>
> **(f) Session gained `photoUrl`.** `Session` now carries `photoUrl: string | null`
> (also `IdpSignInResult.photoUrl`, `IdTokenClaims.picture`), so self-face has a photo
> source without the profiles table.
>
> **(g) Email-OTP + refresh + 401-seam wiring points.** `identity/refresh.ts` exposes
> `setSessionSink(cb)` (Wave B writes the `["session"]` cache from it), `refreshNow()`
> (single-flight; backs `window.__HOUSTON_SESSION_REFRESH__`), and
> `startProactiveRefresh()/stopProactiveRefresh()`. `identity/session-store.ts` exposes
> `subscribeSession(cb)` (broadcasts `Session|null` after every load/save/clear) and
> `SESSION_QUERY_KEY = ["session"]`. Email OTP stays plain `fetch` on both surfaces
> (`otp.ts`); only the final Firebase step differs (REST `signInWithCustomToken` on
> desktop; SDK `signInWithCustomToken` on web).

> **As-built notes (Wave 2b) — Rust shell.**
>
> **(i) Contract audit: NO mismatch.** `oauth_loopback.rs`'s
> `start_oauth_loopback` already met note (c) verbatim (redirect path
> `/auth/callback`, `state` passthrough, `auth://deep-link` payload
> `houston://auth-callback?<query>`). The query-forward was extracted into a pure
> `callback_deep_link(query)` helper for a unit test; behavior identical. Success
> page copy unchanged (it never named Supabase).
>
> **(j) `cancel_oauth_loopback` command ADDED** (note (c).4). New Tauri-managed
> `OauthLoopbackState { Mutex<Option<oneshot::Sender<()>>> }`; the listener task
> now `select!`s between serve/timeout and a cancel signal. A new
> `start_oauth_loopback` supersedes the previous listener (fires its stored
> sender → frees the old port immediately). TS wiring: `osCancelOauthLoopback`
> (os-bridge) + a shim-parity case + injected `abandonLoopback` in
> `oauth-attempt.ts`. **Race-safety:** cancel is called on the timeout and the
> EXTERNAL (unmount) cancel, but NOT on supersession — the superseding
> `start_oauth_loopback` already freed the old port in Rust, and a second cancel
> could race and free the NEW listener's port (single-slot state).
>
> **(k) Dead `houston://auth-callback` OS deep-link handler REMOVED.** With the
> direct-OAuth fallback retired (note (h)), nothing navigates to
> `houston://auth-callback` anymore; the `lib.rs` `on_open_url` branch that
> re-emitted it was dead and is gone. `houston://open` (success-page focus button)
> still brings the window to front. `auth.rs` code/commands/tests UNCHANGED — only
> its stale Supabase-flow module doc was refreshed (the keychain store is
> provider-agnostic). Stale "Supabase" comments across `lib.rs`,
> `loopback_util.rs`, `codex_oauth_loopback.rs`, `os-bridge.ts` refreshed to GCIP.
> *Verified:* `cargo check` clean, `cargo test` 11 loopback tests pass (3 new:
> `callback_deep_link_forwards_query_verbatim`, `replace_*`, `cancel_take_*`);
> no clippy in CI. `identity-desktop-oauth.test.ts` +3 tests (supersede does NOT
> free; unmount + timeout DO free).
>
> **As-built notes (Wave 2c) — admin dashboard.**
>
> **(l) REST password + SDK-popup Google, unified by one REST refresh loop.** The
> web-only admin can't reach the desktop Keychain session store, so it does NOT
> use `identity/refresh.ts`/`session-store.ts`. `admin/auth.ts` (pure, tested) +
> `admin/use-admin-auth.ts` (hook): email/password via REST `signInWithPassword`,
> Google via `@houston/web-identity` `webSignInWithGoogle`; both yield an
> `AdminSession { idToken, refreshToken, expiresAt, email }`. A single proactive
> `refreshIdToken` timer (5-min skew, terminal-vs-transient like `refresh.ts`)
> keeps the bearer fresh; the live `idToken` is the control-plane bearer exactly
> as today's Supabase `access_token` was. Session persisted to localStorage
> (reload survival, parity with old Supabase UX). `refreshIdToken` +
> `TokenSignInResult` newly exported from the identity barrel for this consumer.
> `SignIn` moved to `admin/sign-in.tsx`, keeping `dashboard.tsx` lean. `api.ts`
> unchanged. Removed: `VITE_CP_SUPABASE_*` reads, `@supabase/supabase-js` dep,
> Dockerfile Supabase build args (→ `FIREBASE_*`). Admin reuses the shared
> `identityConfig` (project `gethouston`) — NOT a separate `VITE_CP_FIREBASE_*`.
> *Verified:* `pnpm -r typecheck` green (shim parity OK), `admin-auth.test.ts`
> 6/6, biome clean.
>
> **(m) ⚠️ HIGH — infra gap, email/password NOT enabled in GCIP.**
> `cloud-tf/infra/terraform/identity.tf` configures `authorized_domains` + the
> Google & Microsoft IdPs, but has **no `sign_in { email { enabled = true } }`
> block** on `google_identity_platform_config.default` — i.e. the email/password
> method is not enabled (there is no `allow_password_signup` set either). Until
> infra adds it, admin email/password sign-in returns GCIP `OPERATION_NOT_ALLOWED`
> (the UI shows "This sign-in method isn't enabled for operators."); Google popup
> works. **Not changed here per instructions — flagged for the infra owner.** Admin
> accounts are still provisioned out-of-band by the platform admin (console/Admin
> SDK); this UI only signs existing accounts in (documented in `admin/auth.ts`).

**Wave 3 — integration + i18n + tests (1 agent).**
- Wire seams, run full `pnpm --filter houston-web typecheck`, `cd app && pnpm tsgo --noEmit` + `cargo check`, `pnpm check:fix`.
- i18n: any new error strings under `shell`/auth namespaces in `en/es/pt`; update the `authRequiredBody` strings that name SUPABASE (`shell.json:297`) → Firebase; `pnpm check-locales`.
- Update `release.yml` env, `.env.example`, `knowledge-base/auth.md`.
- Playwright web e2e sign-in path; desktop manual verify.
- *Accept:* full workspace green; `knowledge-base/auth.md` + `cloud/INTEGRATION.md` updated.

---

## 6. Risks + open questions (ranked)

1. **[HIGH — human] Google OAuth client provenance.** Confirm the existing Supabase Google **Web** client lives in GCP project `gethouston`. If yes: reuse it for GCIP's Google provider by adding the GCIP handler redirect (`https://gethouston.firebaseapp.com/__/auth/handler`) — fastest correct path for web/admin. If it's in another project, decide reuse vs new.
2. **[HIGH — human] Desktop OAuth client.** Loopback needs a **new "Desktop app" OAuth client** in project `gethouston` (PKCE, loopback redirect; Google issues an `id_token` to installed clients). Register `127.0.0.1` loopback. Its "secret" is non-confidential (baked via env, per repo Secrets rule).
3. **[RESOLVED — scope] Microsoft + email OTP parity → ALL THREE ship.** Decision: keep full parity with today's `sign-in-screen.tsx` + `email-sign-in.tsx`.
   - **Microsoft:** GCIP `microsoft.com` provider — same `signInWithIdp` REST path (desktop) / `OAuthProvider("microsoft.com")` popup (web) as Google (§2d). *Human action:* an Azure app registration whose redirect includes the desktop loopback ports.
   - **Email OTP:** implemented NOT as Firebase email-link but as a NEW **gateway custom-token flow** (§2d): client POSTs email → gateway emails a 6-digit code → client POSTs the code → gateway returns a GCIP custom token → `signInWithCustomToken`. Keeps the exact 6-digit UX with zero deep-link return. *Coordination:* the `POST /v1/auth/email-otp/{start,verify}` endpoints are a `cloud/` gateway build (contract pinned in `identity/otp.ts`).
4. **[HIGH — coord] Gateway verifier.** Firebase issuer/JWKS swap is a `cloud` Go change (§3) + `INTEGRATION.md`. Sequence: gateway accepts Firebase tokens before/with the client cutover.
5. **[MED] firebase-js-sdk in the shared bundle.** Import `firebase/auth` only from a web-only lazy module so the desktop build (REST path) doesn't ship popup/redirect code. Verify tree-shaking + bundle size.
6. **[MED — confirm] GCIP vs plain Firebase Auth.** Same `securetoken` issuer either way, but confirm which console/project tier `gethouston` is (Identity Platform vs Firebase Auth) — affects provider config UI and quotas.
7. **[LOW] PostHog identity discontinuity.** `alias` switches from Supabase uid to Firebase uid; fresh platform, acceptable, but historical joins break.
8. **[LOW] Keychain blob key reuse.** Reusing `houston-auth` for the Firebase blob means an upgrading user has a stale Supabase blob under that key — first `getSession` parse must tolerate/discard it (treat unknown shape as signed-out; no silent swallow — log + clear).

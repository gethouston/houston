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

**Deep-link/loopback specifics:** `oauth_loopback.rs` is reused as-is (it already captures `?code=` and emits `auth://deep-link`); only the JS side changes what it does with the code (Google exchange, not Supabase). `houston://auth-callback` stays the loopback-bind-failure fallback. Loopback ports `8975-8978` must be added as **Authorized redirect URIs on the Desktop OAuth client** (§3), not Supabase.

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
| — (desktop only) | `__GOOGLE_DESKTOP_CLIENT_ID__` (baked), `GOOGLE_DESKTOP_CLIENT_SECRET` (Rust `option_env!`/env, non-confidential installed-app secret) | new |
| `VITE_CP_SUPABASE_URL/ANON_KEY` | `VITE_CP_FIREBASE_*` (or reuse the same project config) | `admin/dashboard.tsx:21`, `packages/web/Dockerfile` |
| release env `SUPABASE_URL/ANON_KEY` | `FIREBASE_*` + `GOOGLE_DESKTOP_CLIENT_*` | `release.yml:607-608, 1220-1221, 1477-1478`; add alongside |
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

**Wave 2 — parallel, disjoint:**
- **2a App identity wiring** — owns `app/src/lib/{auth.ts, current-user.ts, engine.ts(refresher comment only)}`, `app/src/lib/identity/{session-store.ts, refresh.ts, google-authorize.ts}`, delete `supabase.ts`, `hooks/use-session.ts`, `App.tsx` gate, `packages/web/src/cloud-login.tsx`, `packages/web/src/identity/firebase.ts`. Both desktop (loopback→REST) and web (popup) branches live here (same files); all three methods (Google, Microsoft via `microsoft.com`, email OTP via `otp.ts`+custom token) wire through the SAME modules. **Also: register the identity log sink at startup (as-built note 3) and remove the `__SUPABASE_*__` Vite defines together with `supabase.ts`.** *Accept:* desktop Google/Microsoft sign-in reaches a Firebase session in Keychain; email OTP round-trips to a session; web popup mirrors token to `__HOUSTON_ENGINE__`; 401-refresh seam intact; sign-out clears Keychain + resets analytics.
- **2b Rust loopback** — owns `app/src-tauri/src/oauth_loopback.rs` (accept Google callback, keep `auth://deep-link` bridge), `auth.rs` untouched. *Accept:* `cargo check` + loopback unit tests; success page copy unchanged.
- **2c Admin** — owns `packages/web/src/admin/*` only. firebase email/password + Google popup, `getIdToken()` bearer. *Accept:* admin signs in, dashboard loads with Firebase bearer.

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

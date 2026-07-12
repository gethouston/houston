# Client-auth migration record — Supabase → GCP Identity Platform

Houston's client sign-in moved from **Supabase Auth** to **GCP Identity Platform
(Firebase Auth)**, project `gethouston`, in 2026 (#846). It is **landed**. This doc
is the record: what the platform is now, the deliberate exceptions that keep some
Supabase alive, and the human / cross-repo follow-ups still open.

**The working reference for how auth behaves today is `knowledge-base/auth.md`** —
read that first for per-surface flows, the module map, and code pointers. This doc
is its "what changed / what's still owed" companion (the wave-by-wave build history
now lives in git).

## What shipped (current state, in brief)

- **Provider:** GCIP / Firebase Auth, project `gethouston`. The gateway bearer is a
  **Firebase ID token** — issuer `https://securetoken.google.com/gethouston`, aud
  `gethouston`, `sub` = Firebase uid. Header shape is **unchanged** (`Authorization:
  Bearer <jwt>` + `x-houston-org`); only the token's provenance changed.
- **Four ways in:** Google, Microsoft, passwordless 6-digit email code, and
  (operators only) email + password on `/admin`.
- **Per surface:**
  - **Desktop (Tauri)** — a thin **REST** client, NOT firebase-js-sdk: system-browser
    loopback (`127.0.0.1:8975-8978/auth/callback`) + PKCE → provider `id_token` →
    GCIP `signInWithIdp`; session persisted to the Keychain with a proactive refresh
    timer. REST (not the SDK) because the SDK's popup/redirect + indexedDB persistence
    fight the Tauri webview and Keychain-at-rest; owning the REST calls keeps the
    existing storage-adapter + `__HOUSTON_SESSION_REFRESH__` seams intact.
  - **Web / admin** — firebase-js-sdk popup, confined to
    `packages/web/src/identity/firebase-popup.ts` behind the `@houston/web-identity`
    alias; the desktop bundle aliases a throwing stub so it ships **zero** firebase.
  - **Email OTP** — GCIP has no native 6-digit OTP, so the **gateway** owns it and
    returns a GCIP **custom token** the client exchanges via `signInWithCustomToken`
    (`identity/otp.ts`).
- **Token → gateway seam:** the engine adapter reads the bearer live per request and
  on a 401 runs one single-flight refresh + replay via
  `window.__HOUSTON_SESSION_REFRESH__` — the seam pre-existed the migration and did
  not change.
- **Client code:** `app/src/lib/identity/` + `app/src/lib/auth.ts`;
  `app/src/lib/supabase.ts` was deleted. Release env dropped `SUPABASE_URL` /
  `SUPABASE_ANON_KEY` for `FIREBASE_API_KEY/AUTH_DOMAIN/PROJECT_ID` +
  `GOOGLE_DESKTOP_CLIENT_ID/SECRET` + `MICROSOFT_DESKTOP_CLIENT_ID`.

## Deliberate exceptions — Supabase that stays (do NOT "finish" the migration by removing these)

- **Website waitlist / early-access stays on Supabase.** `website/src/waitlist/index.html`
  does an anon `POST /rest/v1/waitlist` with the public anon key — a pure data write,
  no auth session, no gateway link. Isolated from client auth; the Supabase project
  stays alive to serve it.
- **Server-side gateway JWT verification** (`packages/host/src/config.ts` `CP_SUPABASE_*`)
  is a **separate `cloud/` change** — the Go gateway is authoritative; the issuer/JWKS
  swap to Firebase happens there (tracked below), not in this repo's client.
- **Legacy Keychain blob tolerance.** `session-store.ts` reuses the `houston-auth`
  key, so an upgrading user may hold a stale Supabase blob; `deserializeSession`
  discards any non-Firebase shape (log + sign-out, never throw, never silently accept).
- **Legacy `VITE_HOSTED_ENGINE_AUTH` alias.** The value `supabase` is still accepted
  as a legacy alias for `oauth` (`app/src/lib/engine-mode.ts`) — an env-value
  compatibility alias, not live Supabase.

## Intentional discontinuities

- **PostHog identity.** Sign-in now aliases the Firebase uid, not the old Supabase id,
  so historical joins keyed on the retired `supabase_user_id` no longer stitch to
  post-migration persons — a fresh-platform break, accepted.
- **Profiles / avatars.** The Supabase `public.profiles` table + avatar storage
  retired with Supabase auth (RLS `auth.uid()` can't match Firebase uids);
  `use-user-profiles.ts` is stubbed and faces fall back to initials until a
  gateway-backed profile store lands (follow-up below).
- **Cross-machine migration flag.** The Supabase `user_metadata.migration_status`
  cross-machine flag was retired (Firebase exposes no client-writable user metadata);
  the cloud-migration wizard now gates on the per-uid localStorage outcome on THIS
  machine. Cross-machine RESUME still runs off the gateway's per-agent import markers.

## Open human / cross-repo follow-ups

- **[HIGH — infra] GCIP email/password not enabled.** `cloud-tf/infra/terraform/identity.tf`
  enables the Google + Microsoft IdPs but has no `sign_in { email { enabled = true } }`
  block, so admin email/password returns `OPERATION_NOT_ALLOWED` until infra adds it.
  Google popup works; admin accounts are provisioned out-of-band.
- **[HIGH — human] OAuth client provenance / registrations.** Confirm the Google
  **Web** client lives in project `gethouston` (add the GCIP handler redirect
  `https://gethouston.firebaseapp.com/__/auth/handler`); register a Google **Desktop**
  client (PKCE) with the `127.0.0.1` loopback ports as authorized redirect URIs; and an
  Azure app registration for the `microsoft.com` provider whose redirect includes those
  loopback ports (public PKCE client, no secret).
- **[HIGH — coord] Gateway verifier.** The issuer/JWKS swap to Firebase is a `cloud`
  Go change + `cloud/INTEGRATION.md`; the gateway must accept Firebase tokens before or
  with the client cutover. The email-OTP `POST /v1/auth/email-otp/{start,verify}`
  endpoints are also a `cloud/` build (contract pinned in `identity/otp.ts`).
- **[follow-up] Product stores.** A gateway-backed profile/avatar store (replaces the
  retired Supabase `profiles` table) and an account-level migration flag (restores the
  coarse cross-machine "never offer again").
- **[later] Apple SSO** — add as a GCIP provider when wanted.

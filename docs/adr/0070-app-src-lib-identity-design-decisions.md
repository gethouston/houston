# app/src/lib/identity: design decisions

Covers `app/src/lib/identity/`: desktop and web sign-in, OAuth attempts and callbacks, and session storage. File paths in this record are relative to `app/src/`.

## Desktop uses GCIP REST; web and mobile use firebase-js-sdk

The desktop bundle resolves `@houston/web-identity` to a stub through a Vite alias so firebase-js-sdk never ships there.

Lives in `lib/identity/firebase-rest.ts`, `lib/identity/firebase-popup-stub.ts`, `app/vite.config.ts`.

## One flow per provider

Google uses loopback plus PKCE with a "Desktop app" OAuth client. Microsoft is GCIP brokered over the loopback, because Entra refuses a public-client code redemption from the desktop and GCIP does not accept a client-side Microsoft token. Apple is GCIP brokered through a gateway HTTPS bridge to a `houston://` deep link, because Apple rejects `http://127.0.0.1` redirect URIs at the authorize step.

Lives in `lib/identity/google-authorize.ts`, `lib/identity/microsoft-authorize.ts`, `lib/identity/brokered-loopback.ts`, `lib/identity/apple-authorize.ts`, `lib/identity/brokered-authorize.ts`, `lib/identity/desktop-signin.ts`.

## No custom-scheme fallback when the loopback cannot bind

If all loopback ports are busy, the attempt fails rather than falling back to `houston://auth-callback`, which would open the installed production app instead. Loopback ports come from a fixed candidate list that must match the native list and be registered with the provider.

Lives in `lib/identity/desktop-oauth.ts`, `lib/identity/brokered-loopback.ts`.

## Attempt lifecycle

A new attempt supersedes a pending one as a benign null. Every attempt shares the loopback, so a callback whose `state` does not match this attempt is ignored as stale. The native listener is told the `state` up front. Ports are freed per attempt id so a late cancel cannot free a newer attempt. An invoke cannot be cancelled mid-flight, so a deadline win frees the listener when the invoke finally resolves. Until the browser opens, the sign-in buttons are latched, so the pre-browser steps have their own deadline. The browser open uses the raw shell call so a refused open fails the attempt.

Lives in `lib/identity/oauth-attempt.ts`, `lib/identity/oauth-attempt-contract.ts`, `lib/identity/desktop-oauth.ts`.

## Callback parsing

The `state` is checked first, so a callback completes only the attempt that started it. Fields can arrive in the query (code flow) or fragment (some Entra paths), so both are read. GCIP's brokered URL carries its own `state`; without it the callback cannot be validated, so the attempt refuses.

Lives in `lib/identity/oauth-callback.ts`, `lib/identity/brokered-loopback.ts`.

## GCIP quirks

GCIP puts the machine code in `error.message`, sometimes suffixed after " : ". `signInWithIdp` refuses a link with HTTP 200 and an `errorMessage` field. When a provider email already belongs to an account, GCIP answers `needConfirmation` with no session and drops `email` in some cases, so the desktop holds the credential and names the asserted address for the email-code link flow. Missing photo or name on the account record is backfilled from the provider identity.

Lives in `lib/identity/errors.ts`, `lib/identity/rest-client.ts`, `lib/identity/firebase-idp.ts`, `lib/identity/desktop-link.ts`, `lib/identity/desktop-signin.ts`.

## ID tokens are decoded, not verified

The gateway verifies; the client only reads claims.

Lives in `lib/identity/id-token.ts`.

## Refreshed tokens are dated from the request

`expires_in` counts from when the answer is read, so an answer buffered across a laptop sleep looks fresh while already expired. Expiry is dated from when the request was sent, and an answer that outlived its own lifetime in flight is refused. After a successful refresh the timer waits a minimum interval; transient failures back off exponentially instead of hot-looping.

Lives in `lib/identity/refresh-mint.ts`, `lib/identity/refresh-timer.ts`.

## Refresh never resurrects a cleared session

A monotonic auth epoch is bumped first on every sign-out. A refresh captures the epoch before its async storage read and re-checks before writing; a sign-out that lands during the write is compensated by clearing again. Only revoked or expired refresh tokens and missing accounts are terminal; anything else throws `IdentityError("network")`, because `null` is reserved for a terminal sign-out.

Lives in `lib/identity/refresh.ts`, `lib/identity/session-store.ts`.

## Storage read faults are not sign-outs

A rejected keychain read is a fault, distinct from a missing entry, and no `null` is broadcast on a fault, because that would flip every subscriber to signed out. A failed delete retries once for a transient keychain fault.

Lives in `lib/identity/session-load.ts`, `lib/identity/session-storage-kv.ts`, `lib/identity/session-store.ts`.

## Keychain ACL rebind

On the first successful read of an existing blob each run, the exact blob is re-saved to rebind the macOS keychain item's ACL to the current code signature. It is fire and forget, and a sign-out racing it is compensated.

Lives in `lib/identity/session-load.ts`.

## Logging seam

The app logger pulls the Tauri os-bridge graph, so identity modules log through a seam the app wires up.

Lives in `lib/identity/log.ts`, `lib/logger.ts`.

## Configuration gate

Identity is configured when a baked API key and project id exist; `import.meta.env` is absent under node:test.

Lives in `lib/identity/config.ts`.

## Account deletion contract

`DELETE {gateway}/v1/me` with no `x-houston-org`, because the route has no org resolution. `team_member` is the one non-retryable outcome.

Lives in `lib/identity/delete-account.ts`.

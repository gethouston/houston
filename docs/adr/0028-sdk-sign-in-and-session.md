# Sign-in and session custody live in the SDK

Two SDK modules handle who the caller is. The identity module (`packages/sdk/src/modules/identity`) runs before sign-in: the gateway's email-code pair and the account-exists flow. The session module (`packages/sdk/src/modules/session`) holds the bearer token after sign-in and reports when it lapses. Platform OAuth itself stays in the app. Neither module drives a provider's OAuth screen.

## The identity module sits outside the kernel

`HoustonSdk` is built only once a surface holds a bearer, and identity work happens before that. So `modules/identity/index.ts` is built on its own through the engine adapter, with a `fetch` that carries no bearer. Being off the kernel also keeps it off the command `dispatch` path and out of the assistant catalog. The AI Manager acts as a person who is already signed in, and it never signs anyone in or links accounts.

## Account linking

A Google, Microsoft or Apple sign-in can meet an address that already has an account. `createAccountLink` (`account-link.ts`) then holds the provider credential, mails a code to that address, and links the credential onto the session the code signs in to. It never links onto any other session.

- The held credential never enters the SDK. `PendingLinkHandle` (`types.ts`) is the platform's in-memory reference to it, so no snapshot, log or analytics call can carry it. `AccountLinkPort` is the platform half (Identity Platform calls and the app's session lifecycle, which differ between the desktop REST client and firebase-js-sdk). Every port method translates and none decides.
- `linkOnto` (`link-onto.ts`) links only when the session the code minted names the address the provider asserted, and is the account Identity Platform said holds that address. Identity Platform will link onto any session it is given, so these two checks are the whole rule that keeps one person's credential off another person's account. `account-link.test.ts` pins them.
- `normalizeAddress` (`email-rules.ts`) only trims and lowercases. Folding dots or plus tags would let a code proved for one inbox link a different address, and an Apple relay address only ever equals itself. `emailClaimOf` reads an ID token's payload without verifying it, because the token came straight from Identity Platform.
- A held sign-in older than `LINK_TTL_MS` (10 minutes) restarts instead of linking.
- `sessionChanged` treats losing or replacing the minted session as a sign-out the flow never saw, such as one from another tab. When the person leaves while the code is being checked, `linkOnto` signs out the session minted afterwards, and the sign-out that this cleanup runs must not read as the person leaving (`refuseSignedOut`).
- Failures are split three ways (`failCode`): offline is counted quietly, an unexpected failure is reported for triage, and a refusal is shown to the person. `email-otp.ts` counts a connection that fails before the body is read as `network`, even after the status arrived, and an answer the client cannot parse as unexpected.
- `abandon` keeps a finished link's notice, because the flow's own cleanup signs out through it too. `cancel` clears the notice, and a code already sent stays valid on the gateway.

## Token custody and the 401 signal

The runtime client takes its token in config, so rotating it would mean rebuilding the client and dropping in-flight streams. Instead `createAuthFetch` (`session/auth-fetch.ts`) reads the token from the injected `KeyValueStore` on every request and stamps `Authorization: Bearer`. A refresh applies to the next request with no rebuild. With no stored token the request goes out untouched, which covers the pre-login and self-host-without-auth cases.

- The host composes `createAuthFetch(baseFetch, storage)` into `SdkPorts.fetch` before it constructs the SDK, because the kernel builds the engine client from `config.ports.fetch` and has no token setter afterwards. The wrapper and the session module share the same `storage`, so there is no global holder.
- The wrapper is the one place that knows which token each request carried, so it classifies 401s. It reports the token it stamped, or `null` for a tokenless request, and `AuthExpiryNotifier` (`packages/sdk/src/auth-expiry.ts`) suppresses a stale 401 that lands after a rotation and a tokenless one. Reporting the request's own token, not the one current when the 401 lands, is what makes that suppression possible.
- The notifier is born inside the kernel after the wrapper exists, so the reporter is bound late through the `CONNECT_AUTH_EXPIRY` symbol and `connectAuthExpiry`. On any other `fetch` that call does nothing: a host with no bearer auth has no token to expire. The session module does this binding because it is composed first and holds both `ports.fetch` and the notifier.
- `createSessionModule` keeps `currentToken` as a synchronous mirror for the `connection` view-model and for 401 dedupe, and `tokenSetByHost` stops a late hydrate from overwriting a token the host already set. A storage read failure during hydrate is logged and the module starts signed out: nothing the person did caused it and there is no UI yet, and the host can still set a token afterwards.
- The session module does not report transport liveness. The streams that own a connection do that.

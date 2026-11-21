# app/src/components/auth: design decisions

Covers `app/src/components/auth/`: the sign-in screen and its provider and email-code paths. File paths in this record are relative to that folder.

## Sign-in screen behavior

One screen serves local and hosted sessions. Native builds offer only configured native providers and omit the referral promotion (a purchase promotion in store apps). Email code sign-in is always available and stays in the app. The desktop loopback flow is cancelled on unmount so a late callback cannot replace a session established another way. A provider sign-in that met an existing account swaps the options for the account link code step, which the SDK owns.

Lives in `app/src/components/auth/sign-in-screen.tsx`, `use-provider-sign-in.ts`, `account-link-panel.tsx`, `referral-panel.tsx`.

## Returning-user path

The previous sign-in is remembered in its own localStorage key, which survives sign-out. `ContinueLastSignIn` owns the screen's single filled slot and runs the same sign-in the matching pill would; for email it prefills the address and sends the code in one click (a token ref ensures each token sends once). While it shows, the email send button steps down to secondary. Submit handlers take values explicitly to avoid racing state updates.

Lives in `continue-last-sign-in.tsx`, `email-sign-in.tsx`, `sign-in-screen.tsx`.

## Provider buttons

On phones the providers stack full width with full labels, because a store app may offer a single provider and Sign in with Apple must be as prominent as every other option. From `md:` they are equal-width icon-only pills with `aria-label` and `title`. Brand colors are mandated by provider guidelines and are the one sanctioned exception to the no-hex rule; Apple's mark is monochrome (`currentColor`).

Lives in `provider-button-row.tsx`, `provider-brand-icons.tsx`.

## Post-hand-off errors

OAuth failures after the browser hand-off arrive as identity codes through `onAuthError` and are shown on the error line; without that they were invisible. `onBrowserOpened` re-enables buttons as soon as the browser opens so the up to 300 s round trip never freezes them; a pre-browser failure is cleaned up separately.

Lives in `use-provider-sign-in.ts`.

## Error copy buckets

Identity failures are classified once into `IdentityErrorCode`; the sign-in UI maps them with an exhaustive `Record`, so a new code fails to compile until placed. Distinct buckets exist where generic copy would be wrong: a spent merge code needs a new one, a sign-out that could not delete the stored session would sign the user back in on next launch, a sign-out where only the cached lists survived must not say "you may still be signed in", and a sign-in that never reached the browser gets "try again".

Lives in `auth-errors.ts`.

## Storage unavailable is not signed out

When secure storage cannot be read (locked, denied, stale post-update ACL), a dedicated screen shows with Retry instead of the sign-in screen, which would read as a spurious logout. It reads the i18n singleton directly because the web EngineGate renders gate states outside `I18nextProvider`. Copy avoids technical terms.

Lives in `storage-unavailable-screen.tsx`.

## Layout details

The email row is 44px on phones and 40px from `md:`. Legal footer links use an `::after` hit slop for 44px phone targets, stopping at `md:`. The code footer uses `pr-12` to mirror the send button so copy aligns with the pin boxes. The card sits on the first-run background which pins light, so it reads the same in both themes.

Lives in `email-sign-in.tsx`, `sign-in-panels.tsx`, `email-code-footer.tsx`, `sign-in-screen.tsx`.

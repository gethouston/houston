// Device-local memory of the most recent successful sign-in, so the sign-in
// screen can suggest "Last time you signed in with Google" (and highlight that
// provider) even AFTER the user signs out.
//
// It lives under its OWN device-global localStorage key, deliberately separate
// from the identity session blob: `signOut()` clears the session + the persisted
// per-user caches, but this hint must SURVIVE that so the next sign-in is still
// guided. It is a UX convenience only — never a credential — so a masked email
// is the most it ever exposes.
//
// Reads/writes are fully guarded: a disabled/full/corrupt storage returns "no
// hint" and never throws into the sign-in flow. Every discard is logged through
// the identity seam (visible in frontend.log), never silently swallowed.

import type { TFunction } from "i18next";
import type { Provider } from "../components/auth/provider-button-row";
import { identityLog } from "./identity/log.ts";
import type { AuthProvider } from "./identity/session";

const STORAGE_KEY = "houston.last-sign-in";
const VERSION = 1;

const AUTH_PROVIDERS: readonly AuthProvider[] = [
  "google.com",
  "microsoft.com",
  "apple.com",
  "password",
  "custom",
];

/** The remembered facts about the last successful sign-in. */
export interface LastSignIn {
  provider: AuthProvider;
  /** Account email, or "" when the provider withheld it. */
  email: string;
}

/** Versioned on-disk shape, so a future change discards old blobs cleanly. */
interface StoredLastSignIn {
  v: number;
  provider: AuthProvider;
  email: string;
}

function isStored(value: unknown): value is StoredLastSignIn {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    s.v === VERSION &&
    typeof s.provider === "string" &&
    (AUTH_PROVIDERS as readonly string[]).includes(s.provider) &&
    typeof s.email === "string"
  );
}

/** Remember how this sign-in happened. Best-effort: never blocks sign-in. */
export function writeLastSignIn(hint: LastSignIn): void {
  const record: StoredLastSignIn = {
    v: VERSION,
    provider: hint.provider,
    email: hint.email,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (e) {
    identityLog(
      "warn",
      `could not remember last sign-in: ${String(e)}`,
      "auth/last-sign-in",
    );
  }
}

/** Read the last sign-in hint, or null when absent / unreadable / stale. */
export function readLastSignIn(): LastSignIn | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    identityLog(
      "warn",
      `could not read last sign-in: ${String(e)}`,
      "auth/last-sign-in",
    );
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt blob (or a superseded shape from a future version): treat as no
    // hint. The next successful sign-in overwrites it.
    return null;
  }
  return isStored(parsed)
    ? { provider: parsed.provider, email: parsed.email }
    : null;
}

/**
 * Mask an email for this low-trust surface: keep only the first character of the
 * local part, hide the rest, keep the full domain.
 * `"jane@gethouston.ai"` → `"j…@gethouston.ai"`.
 * A withheld or malformed address returns `""` so the caller shows no address.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0 || at === email.length - 1) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return local.length <= 1 ? `${local}${domain}` : `${local[0]}…${domain}`;
}

/** Which affordance the sign-in screen highlights for the remembered provider. */
export type SignInHighlight = Provider | "email";

/** How to present the last-sign-in hint on the screen. */
export interface LastSignInDisplay {
  /** The provider pill to ring, or "email" for the email form. */
  highlight: SignInHighlight;
  /** Brand name to interpolate into the copy, or null for the email path. */
  providerName: string | null;
  /** Masked address, or "" when none is known. */
  maskedEmail: string;
}

const PROVIDER_META: Record<
  AuthProvider,
  { highlight: SignInHighlight; name: string | null }
> = {
  "google.com": { highlight: "google", name: "Google" },
  "microsoft.com": { highlight: "azure", name: "Microsoft" },
  "apple.com": { highlight: "apple", name: "Apple" },
  // Passwordless email OTP mints a "custom"-token session; "password" is the
  // direct email/password shape. Both map back to the email form.
  password: { highlight: "email", name: null },
  custom: { highlight: "email", name: null },
};

/** Resolve a stored hint into everything the screen needs to render it. */
export function describeLastSignIn(hint: LastSignIn): LastSignInDisplay {
  const meta = PROVIDER_META[hint.provider];
  return {
    highlight: meta.highlight,
    providerName: meta.name,
    maskedEmail: maskEmail(hint.email),
  };
}

// Phrase the "last time you signed in with…" hint. Full sentences per case
// (never fragment concatenation) so word order stays correct in every locale.
export function lastSignInHint(
  d: LastSignInDisplay,
  t: TFunction<"auth">,
): string {
  if (d.providerName) {
    return d.maskedEmail
      ? t("lastSignIn.withProviderEmail", {
          provider: d.providerName,
          email: d.maskedEmail,
        })
      : t("lastSignIn.withProvider", { provider: d.providerName });
  }
  return d.maskedEmail
    ? t("lastSignIn.withEmailAddress", { email: d.maskedEmail })
    : t("lastSignIn.withEmail");
}

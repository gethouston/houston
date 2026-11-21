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

export interface LastSignIn {
  provider: AuthProvider;
  email: string;
}

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
    return null;
  }
  return isStored(parsed)
    ? { provider: parsed.provider, email: parsed.email }
    : null;
}

function displayEmail(email: string): string {
  const at = email.indexOf("@");
  return at <= 0 || at === email.length - 1 ? "" : email;
}

export type SignInHighlight = Provider | "email";

export interface LastSignInDisplay {
  highlight: SignInHighlight;
  providerName: string | null;
  email: string;
}

const PROVIDER_META: Record<
  AuthProvider,
  { highlight: SignInHighlight; name: string | null }
> = {
  "google.com": { highlight: "google", name: "Google" },
  "microsoft.com": { highlight: "azure", name: "Microsoft" },
  "apple.com": { highlight: "apple", name: "Apple" },
  password: { highlight: "email", name: null },
  custom: { highlight: "email", name: null },
};

export function describeLastSignIn(hint: LastSignIn): LastSignInDisplay {
  const meta = PROVIDER_META[hint.provider];
  return {
    highlight: meta.highlight,
    providerName: meta.name,
    email: displayEmail(hint.email),
  };
}

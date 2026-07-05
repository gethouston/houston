import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * Pure auth.json file logic (no config import — tests drive it with explicit
 * paths). The Gate #2 invariant lives here: a served credential is ALWAYS
 * written with refresh="", and the post-connect scrub strips whatever pi's own
 * device-code login wrote. See serve.ts for the config-bound wrappers.
 */

/**
 * The pi auth.json entry shape per provider. Two variants, matching pi's own
 * `AuthCredential` union: an OAuth token (Claude / Codex subscriptions) or a
 * plain API key (pasted, never expires, no refresh).
 */
export type PiCred =
  | {
      type: "oauth";
      access: string;
      refresh: string;
      expires: number;
      accountId?: string;
      /**
       * GitHub Copilot Enterprise (GHE): the company GitHub domain this
       * credential was issued for (e.g. `acme.ghe.com`). Absent = individual
       * Copilot (github.com). pi's `modifyModels` reads it to derive the
       * enterprise API base URL, and the central refresh hits the matching
       * `api.<domain>/copilot_internal/v2/token`.
       */
      enterpriseUrl?: string;
    }
  | { type: "api_key"; key: string };

/**
 * What the control plane serves per turn — note: NO refresh token. `kind`
 * distinguishes an OAuth access token from a static API key; absent means
 * OAuth (every legacy served credential). For an API key, `access` carries the
 * key and `expires` is 0 (it never expires).
 */
export type ServedCredential = {
  provider: string;
  access: string;
  expires: number;
  accountId: string | null;
  kind?: "oauth" | "api_key";
  /** GitHub Copilot Enterprise domain, served so the runtime can set the right
   *  API base URL; null/absent = individual Copilot. See `PiCred.enterpriseUrl`. */
  enterpriseUrl?: string | null;
};

/** The auth.json contents at `path`, or {} when absent/corrupt. */
export function readAuthFile(path: string): Record<string, PiCred> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, PiCred>;
  } catch {
    return {};
  }
}

function writeJsonAtomic(path: string, contents: unknown): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(contents), { mode: 0o600 }); // atomic write
  renameSync(tmp, path);
}

function writeAuthFile(path: string, contents: Record<string, PiCred>): void {
  writeJsonAtomic(path, contents);
}

/**
 * Write a served credential into auth.json. An OAuth token is always written
 * with an empty refresh field (Gate #2); an API key is written as pi's
 * `api_key` variant (no refresh, no expiry — there is nothing to scrub).
 */
export function applyServedCredential(path: string, c: ServedCredential): void {
  const entry: PiCred =
    c.kind === "api_key"
      ? { type: "api_key", key: c.access }
      : {
          type: "oauth",
          access: c.access,
          refresh: "",
          expires: c.expires,
          ...(c.accountId ? { accountId: c.accountId } : {}),
          // Carry the Copilot Enterprise domain so pi's modifyModels points the
          // model at the enterprise API base URL (Gate #2 still holds — this is
          // not a secret, and refresh="" stays scrubbed).
          ...(c.enterpriseUrl ? { enterpriseUrl: c.enterpriseUrl } : {}),
        };
  const merged = readAuthFile(path);
  merged[c.provider] = entry;
  writeAuthFile(path, merged);
}

/**
 * Rewrite every OAuth auth.json entry at `path` with refresh="". Idempotent.
 * API-key entries carry no refresh token, so they are left untouched. Returns
 * the providers that were actually scrubbed.
 */
export function scrubRefreshTokensAt(path: string): string[] {
  const auth = readAuthFile(path);
  const scrubbed: string[] = [];
  for (const [provider, cred] of Object.entries(auth)) {
    if (cred?.type === "oauth" && cred.refresh) {
      auth[provider] = { ...cred, refresh: "" };
      scrubbed.push(provider);
    }
  }
  if (scrubbed.length) writeAuthFile(path, auth);
  return scrubbed;
}

/**
 * Provenance manifest ("served-providers.json", next to auth.json): the
 * providers whose auth.json entry was written by the serve path. An
 * authoritative central 404 may only remove providers listed here — a
 * locally-connected credential the central store never held (the Anthropic
 * setup token, an openai-compatible local-model key) is shaped exactly like a
 * served one (api_key / refresh=""), so shape alone cannot prove ownership.
 */
export function readServedProvidersAt(path: string): string[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeServedProvidersAt(
  path: string,
  providers: string[],
): void {
  writeJsonAtomic(path, providers);
}

/**
 * Remove one provider only when the entry is owned by the serve path: an OAuth
 * credential already scrubbed to refresh="" or an API key served from the host.
 * A refresh-bearing OAuth entry is pi's just-connected credential before capture
 * + scrub, so a transient gateway 404 must not delete it. The caller gates this
 * further on the served-providers manifest (see serve.ts) — shape is defense in
 * depth, provenance is the decider.
 */
export function removeServedCredentialAt(
  path: string,
  provider: string,
): boolean {
  const auth = readAuthFile(path);
  const cred = auth[provider];
  if (
    !cred ||
    (cred.type === "oauth" && cred.refresh) ||
    (cred.type !== "oauth" && cred.type !== "api_key")
  ) {
    return false;
  }
  delete auth[provider];
  writeAuthFile(path, auth);
  return true;
}

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { credentialSiblings } from "./credential-siblings";

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

function writeAuthFile(path: string, contents: Record<string, PiCred>): void {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(contents), { mode: 0o600 }); // atomic write
  renameSync(tmp, path);
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
  // OpenCode Zen + Go share one opencode.ai key (pi reads OPENCODE_API_KEY for
  // both gateways). Mirror the served entry onto its sibling(s) so the gateway
  // this credential wasn't served under still reads as connected AND its turns
  // authenticate — otherwise it surfaces a spurious "sign in again" card.
  for (const sibling of credentialSiblings(c.provider)) merged[sibling] = entry;
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

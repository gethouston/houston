import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  isPersonalScope,
  TEAM_CREDENTIAL_SCOPE,
} from "../session/acting-context";

/**
 * Pure auth.json file logic (no config import — tests drive it with explicit
 * paths). The Gate #2 invariant lives here: a served credential is ALWAYS
 * written with refresh="", and the post-connect scrub strips whatever pi's own
 * device-code login wrote. See serve.ts for the config-bound wrappers.
 */

/** Where a personal scope's credential files live, under the data dir. */
const AUTH_USERS_DIR = "auth-users";

/**
 * The credential file for one scope inside `dataDir`.
 *
 * The TEAM scope keeps `<dataDir>/auth.json` — same path, same bytes as before
 * HOU-976, so desktop / self-host / every pre-existing pod is untouched. A
 * personal scope gets `<dataDir>/auth-users/<sha256(sub)[:16]>.json`: the sub is
 * hashed because it is an opaque identity we will not spread across a shared
 * pod's filesystem, and 16 hex chars (64 bits) is collision-free at team sizes.
 */
export function authPathIn(dataDir: string, scopeKey: string): string {
  if (!isPersonalScope(scopeKey)) return join(dataDir, "auth.json");
  return join(dataDir, AUTH_USERS_DIR, `${scopeFileStem(scopeKey)}.json`);
}

/** The served-providers manifest for one scope (sibling of its auth file). */
export function servedProvidersPathIn(
  dataDir: string,
  scopeKey: string,
): string {
  if (!isPersonalScope(scopeKey)) return join(dataDir, "served-providers.json");
  return join(
    dataDir,
    AUTH_USERS_DIR,
    `${scopeFileStem(scopeKey)}.served-providers.json`,
  );
}

/**
 * The Claude CLI's own credential store for one PERSONAL scope — a sibling
 * directory of that scope's auth file, handed to the SDK subprocess as
 * `CLAUDE_SECURESTORAGE_CONFIG_DIR` (backends/claude/scope-guard.ts explains
 * why, and why it is NOT `CLAUDE_CONFIG_DIR`).
 *
 * It lives under `auth-users/` deliberately, not beside the shared login dir:
 * that path segment is already excluded from store-sync unconditionally
 * (runtime-client `object-sync/hydrate.ts`) and denied to the agent's own file
 * tools (session/tools/fs-guard.ts), so anything the CLI ever writes here — a
 * `.credentials.json`, its `.oauth_refresh.lock` — can neither reach the shared
 * object store nor be read by the model. Houston writes nothing into it; it
 * exists so the CLI's credential lookups resolve to a dir that holds NOTHING
 * instead of the pod-shared team credential.
 *
 * There is deliberately no team-scope form: the team's credential store IS the
 * shared login dir, so a team turn sets no override at all.
 */
export function claudeSecureStorageDirIn(
  dataDir: string,
  scopeKey: string,
): string {
  if (!isPersonalScope(scopeKey))
    throw new Error(
      `the "${TEAM_CREDENTIAL_SCOPE}" scope has no per-identity Claude credential store; it reads the shared login dir`,
    );
  return join(
    dataDir,
    AUTH_USERS_DIR,
    `${scopeFileStem(scopeKey)}.claude-storage`,
  );
}

/** The hashed file stem for a `u:<sub>` scope key. Rejects anything else. */
function scopeFileStem(scopeKey: string): string {
  if (!scopeKey.startsWith("u:"))
    throw new Error(
      `credential scope key must be "${TEAM_CREDENTIAL_SCOPE}" or "u:<sub>", got "${scopeKey}"`,
    );
  return createHash("sha256")
    .update(scopeKey.slice("u:".length))
    .digest("hex")
    .slice(0, 16);
}

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
  /**
   * WHOSE credential the gateway resolved for this serve (HOU-976). Absent from
   * a pre-HOU-976 gateway, read as `"team"` — the only thing it could have been.
   * Never written into auth.json; it drives the provider-error stamp and the
   * `/providers` row instead (auth/served-scope.ts).
   */
  scope?: "personal" | "team";
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
  // A personal scope's first write creates `auth-users/` (a no-op for the team
  // scope's long-existing data dir). The 0700/0600 modes only keep OTHER UNIX
  // USERS out, and even that is umask-masked; the agent's own tools run as the
  // SAME uid as the runtime, so what actually stops them reading a team member's
  // token is the file-tool deny rule in session/tools/fs-guard.ts.
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(contents), { mode: 0o600 }); // atomic write
  renameSync(tmp, path);
}

/** Atomic (0600) overwrite of the auth.json at `path`. */
export function writeAuthFile(
  path: string,
  contents: Record<string, PiCred>,
): void {
  writeJsonAtomic(path, contents);
}

/**
 * Write a served credential into auth.json. An OAuth token is always written
 * with an empty refresh field (Gate #2); an API key is written as pi's
 * `api_key` variant (no refresh, no expiry — there is nothing to scrub).
 */
export function hasRefreshToken(cred: PiCred | undefined): boolean {
  return cred?.type === "oauth" && cred.refresh.length > 0;
}

export function applyServedCredential(
  path: string,
  c: ServedCredential,
): boolean {
  const merged = readAuthFile(path);
  // pi's device-code login has completed locally, but the host has not captured
  // and scrubbed it yet. Serving the old central row here would destroy the only
  // refresh token before /auth/export can hand it to the gateway.
  if (hasRefreshToken(merged[c.provider])) return false;
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
  merged[c.provider] = entry;
  writeAuthFile(path, merged);
  return true;
}

/**
 * Rewrite ONE provider's OAuth entry at `path` with refresh="". Idempotent; a
 * missing file, an absent entry, an api_key entry (no refresh token to strip)
 * and an already-scrubbed entry are all no-ops. Returns whether anything was
 * actually scrubbed.
 *
 * Provider-scoped by design (PRODUCT-1320): capture is per-provider, and the
 * old whole-file scrub let provider A's post-capture scrub erase provider B's
 * refresh token in the window between B's own device-code login and B's
 * capture export — B ended up access-only centrally and died at first expiry.
 * There is deliberately NO full-scrub form: every caller knows exactly which
 * provider it just captured.
 */
export function scrubRefreshTokenAt(path: string, provider: string): boolean {
  const auth = readAuthFile(path);
  const cred = auth[provider];
  if (cred?.type !== "oauth" || !cred.refresh) return false;
  auth[provider] = { ...cred, refresh: "" };
  writeAuthFile(path, auth);
  return true;
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
    hasRefreshToken(cred) ||
    (cred.type !== "oauth" && cred.type !== "api_key")
  ) {
    return false;
  }
  delete auth[provider];
  writeAuthFile(path, auth);
  return true;
}

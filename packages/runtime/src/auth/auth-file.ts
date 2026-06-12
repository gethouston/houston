import { writeFileSync, renameSync, readFileSync, existsSync } from "node:fs";

/**
 * Pure auth.json file logic (no config import — tests drive it with explicit
 * paths). The Gate #2 invariant lives here: a served credential is ALWAYS
 * written with refresh="", and the post-connect scrub strips whatever pi's own
 * device-code login wrote. See serve.ts for the config-bound wrappers.
 */

/** The pi auth.json entry shape per provider. */
export type PiCred = {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
};

/** What the control plane serves per turn — note: NO refresh token. */
export type ServedCredential = {
  provider: string;
  access: string;
  expires: number;
  accountId: string | null;
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

/** Write a served credential into auth.json — always with an empty refresh field. */
export function applyServedCredential(path: string, c: ServedCredential): void {
  const entry: PiCred = { type: "oauth", access: c.access, refresh: "", expires: c.expires };
  if (c.accountId) entry.accountId = c.accountId;
  const merged = readAuthFile(path);
  merged[c.provider] = entry;
  writeAuthFile(path, merged);
}

/**
 * Rewrite every auth.json entry at `path` with refresh="". Idempotent.
 * Returns the providers that were actually scrubbed.
 */
export function scrubRefreshTokensAt(path: string): string[] {
  const auth = readAuthFile(path);
  const scrubbed: string[] = [];
  for (const [provider, cred] of Object.entries(auth)) {
    if (cred?.refresh) {
      auth[provider] = { ...cred, refresh: "" };
      scrubbed.push(provider);
    }
  }
  if (scrubbed.length) writeAuthFile(path, auth);
  return scrubbed;
}

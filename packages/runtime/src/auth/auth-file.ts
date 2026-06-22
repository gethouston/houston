import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * Pure auth.json file logic (no config import — tests drive it with explicit
 * paths). The Gate #2 invariant lives here: a served credential is ALWAYS
 * written with refresh="", and the post-connect scrub strips whatever pi's own
 * device-code login wrote. See serve.ts for the config-bound wrappers.
 */

/**
 * The pi auth.json entry shape per provider — pi's own on-disk format. OAuth
 * providers store a (refreshable) token; api-key providers store the raw key.
 */
export type PiCred =
  | {
      type: "oauth";
      access: string;
      refresh: string;
      expires: number;
      accountId?: string;
    }
  | { type: "api_key"; key: string };

/**
 * What the control plane serves per turn. OAuth: an access token ONLY (no
 * refresh — Gate #2). API-key: the key itself in `access` (a key is the whole
 * secret; there is nothing shorter-lived to serve). `kind` tells the sandbox
 * which auth.json shape to write.
 */
export type ServedCredential = {
  provider: string;
  kind?: "oauth" | "api_key";
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

/**
 * Write a served credential into auth.json. OAuth entries land with an empty
 * refresh field (Gate #2); api-key entries land as pi's `{ type: "api_key" }`
 * shape with the served key.
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
        };
  const merged = readAuthFile(path);
  merged[c.provider] = entry;
  writeAuthFile(path, merged);
}

/**
 * Rewrite every OAuth auth.json entry at `path` with refresh="". Idempotent.
 * Api-key entries hold no refresh token, so they are left untouched. Returns the
 * providers that were actually scrubbed.
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

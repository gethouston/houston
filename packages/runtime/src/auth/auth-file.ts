import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import {
  isPersonalScope,
  TEAM_CREDENTIAL_SCOPE,
} from "../session/acting-context";

const AUTH_USERS_DIR = "auth-users";

export function authPathIn(dataDir: string, scopeKey: string): string {
  if (!isPersonalScope(scopeKey)) return join(dataDir, "auth.json");
  return join(dataDir, AUTH_USERS_DIR, `${scopeFileStem(scopeKey)}.json`);
}

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

export type PiCred =
  | {
      type: "oauth";
      access: string;
      refresh: string;
      expires: number;
      accountId?: string;
      // WHY: Copilot Enterprise refreshes at api.<domain>; dropping the domain breaks refresh. ADR-0008
      enterpriseUrl?: string;
    }
  | { type: "api_key"; key: string };

export type ServedCredential = {
  provider: string;
  access: string;
  expires: number;
  accountId: string | null;
  kind?: "oauth" | "api_key";
  enterpriseUrl?: string | null;
  scope?: "personal" | "team";
};

export function readAuthFile(path: string): Record<string, PiCred> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, PiCred>;
  } catch {
    return {};
  }
}

function writeJsonAtomic(path: string, contents: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = atomicTempPath(path);
  writeFileSync(tmp, JSON.stringify(contents), { mode: 0o600 });
  renameSync(tmp, path);
}

export function writeAuthFile(
  path: string,
  contents: Record<string, PiCred>,
): void {
  writeJsonAtomic(path, contents);
}

export function hasRefreshToken(cred: PiCred | undefined): boolean {
  return cred?.type === "oauth" && cred.refresh.length > 0;
}

export function applyServedCredential(
  path: string,
  c: ServedCredential,
): boolean {
  const merged = readAuthFile(path);
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
          ...(c.enterpriseUrl ? { enterpriseUrl: c.enterpriseUrl } : {}),
        };
  merged[c.provider] = entry;
  writeAuthFile(path, merged);
  return true;
}

export function scrubRefreshTokenAt(path: string, provider: string): boolean {
  const auth = readAuthFile(path);
  const cred = auth[provider];
  if (cred?.type !== "oauth" || !cred.refresh) return false;
  auth[provider] = { ...cred, refresh: "" };
  writeAuthFile(path, auth);
  return true;
}

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

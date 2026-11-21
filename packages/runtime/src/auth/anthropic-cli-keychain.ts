import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

const KEYCHAIN_SERVICE_BASE = "Claude Code-credentials";
const SECURITY_NOT_FOUND = 44;
const MAX_KEYCHAIN_DELETES = 8;

export type SecurityRun = (
  args: string[],
) => Promise<{ code: number; stdout: string }>;

export type KeychainDeps = {
  platform?: NodeJS.Platform;
  user?: string | null;
  run?: SecurityRun;
};

export function keychainServiceFor(configDir: string): string {
  const digest = createHash("sha256").update(configDir).digest("hex");
  return `${KEYCHAIN_SERVICE_BASE}-${digest.slice(0, 8)}`;
}

export async function readKeychainCredential(
  configDir: string,
  deps: KeychainDeps = {},
): Promise<string | null> {
  if ((deps.platform ?? process.platform) !== "darwin") return null;
  const run = deps.run ?? runSecurity;
  const service = keychainServiceFor(configDir);
  const user = deps.user === undefined ? (process.env.USER ?? null) : deps.user;
  const accounts: Array<string | null> = user ? [user, null] : [null];
  for (const account of accounts) {
    const { code, stdout } = await run([
      "find-generic-password",
      "-s",
      service,
      ...(account ? ["-a", account] : []),
      "-w",
    ]);
    if (code === 0 && hasAccessToken(stdout)) return stdout;
  }
  return null;
}

export async function discardKeychainCredential(
  configDir: string,
  deps: KeychainDeps = {},
): Promise<void> {
  if ((deps.platform ?? process.platform) !== "darwin") return;
  const run = deps.run ?? runSecurity;
  const service = keychainServiceFor(configDir);
  for (let i = 0; i < MAX_KEYCHAIN_DELETES; i++) {
    const { code } = await run(["delete-generic-password", "-s", service]);
    if (code === SECURITY_NOT_FOUND) return;
    if (code !== 0)
      throw new Error(`security delete-generic-password exited ${code}`);
  }
  throw new Error(
    `more than ${MAX_KEYCHAIN_DELETES} Keychain items under ${service}`,
  );
}

function hasAccessToken(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: unknown };
    };
    const token = parsed.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.length > 0;
  } catch {
    return false;
  }
}

function runSecurity(
  args: string[],
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile("security", args, { timeout: 10_000 }, (err, stdout) => {
      if (!err) return resolve({ code: 0, stdout });
      const code = (err as { code?: unknown }).code;
      if (typeof code === "number") return resolve({ code, stdout });
      reject(
        new Error(`could not run the macOS security tool: ${err.message}`),
      );
    });
  });
}

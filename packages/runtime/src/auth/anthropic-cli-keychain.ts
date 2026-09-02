import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

/**
 * macOS Keychain access for the CLI-driven Claude login
 * (anthropic-cli-login.ts). On darwin the bundled Claude CLI stores the
 * credential it mints in the Keychain instead of `<dir>/.credentials.json`,
 * under the service `Claude Code-credentials-<sha256(CLAUDE_CONFIG_DIR)[..8]>`
 * and the username as the account. This mirrors the desktop shell's
 * `claude_login/credential.rs` + `discard.rs` (same CLI, same scheme); keep
 * the two in sync.
 *
 * Only the DIR-SCOPED service is ever read: the bare `Claude Code-credentials`
 * item belongs to the user's own `~/.claude` install, and storing THAT would
 * make Houston and their personal CLI rotate one refresh-token family and sign
 * each other out. Off macOS every function is a no-op.
 */

const KEYCHAIN_SERVICE_BASE = "Claude Code-credentials";
/** `security` exits 44 (`errSecItemNotFound`) when no item matches. */
const SECURITY_NOT_FOUND = 44;
/** The CLI writes one item per account; past this `security` is misbehaving. */
const MAX_KEYCHAIN_DELETES = 8;

/** One `security` invocation: its exit code and stdout (test seam). */
export type SecurityRun = (
  args: string[],
) => Promise<{ code: number; stdout: string }>;

export type KeychainDeps = {
  platform?: NodeJS.Platform;
  /** The login's Keychain account; `null` means "no username known". */
  user?: string | null;
  run?: SecurityRun;
};

/**
 * The CLI's Keychain service for a `CLAUDE_CONFIG_DIR`: the hash input is the
 * dir string EXACTLY as the spawn passed it in the env (no normalization).
 */
export function keychainServiceFor(configDir: string): string {
  const digest = createHash("sha256").update(configDir).digest("hex");
  return `${KEYCHAIN_SERVICE_BASE}-${digest.slice(0, 8)}`;
}

/**
 * Read the credential JSON the CLI cached for `configDir`, or null when there
 * is none (also off macOS). The username's item is tried first — an
 * env-scrubbed SDK subprocess can leave an emptied husk under another account
 * — and a hit without a usable access token is skipped, not returned. Throws
 * only when `security` itself cannot run.
 */
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

/**
 * Delete every Keychain item the CLI cached for `configDir`. Idempotent:
 * nothing cached is success. Once the credential is stored in auth.json the
 * Keychain copy is a second refresh-token holder, and anything that ever
 * refreshed it would trip Anthropic's reuse detection and revoke the family.
 */
export async function discardKeychainCredential(
  configDir: string,
  deps: KeychainDeps = {},
): Promise<void> {
  if ((deps.platform ?? process.platform) !== "darwin") return;
  const run = deps.run ?? runSecurity;
  const service = keychainServiceFor(configDir);
  for (let i = 0; i < MAX_KEYCHAIN_DELETES; i++) {
    // No `-a`: each call deletes the FIRST item under the service regardless
    // of account; loop until none remain.
    const { code } = await run(["delete-generic-password", "-s", service]);
    if (code === SECURITY_NOT_FOUND) return;
    if (code !== 0)
      throw new Error(`security delete-generic-password exited ${code}`);
  }
  throw new Error(
    `more than ${MAX_KEYCHAIN_DELETES} Keychain items under ${service}`,
  );
}

/** `{claudeAiOauth:{accessToken}}` with a non-empty token — never logged. */
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

/**
 * Run `security`. A non-zero exit resolves with its code (absent item, a
 * locked keychain); a spawn failure or a hung GUI prompt (timeout) rejects.
 */
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

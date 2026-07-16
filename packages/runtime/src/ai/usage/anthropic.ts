import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { authStorage } from "../../auth/storage";
import { claudeCredentialsFile } from "../../backends/claude/paths";
import {
  clampPercent,
  type ProviderUsage,
  type ProviderUsageWindow,
} from "./types";

/**
 * Claude (Pro / Max) account usage via Anthropic's OAuth usage API — the same
 * surface Claude Code's own `/usage` reads:
 *
 *   GET https://api.anthropic.com/api/oauth/usage
 *   Authorization: Bearer <oauth access token>
 *   anthropic-beta: oauth-2025-04-20
 *
 * Response: `five_hour` / `seven_day` / `seven_day_opus` blocks, each
 * `{utilization: 0-100, resets_at: ISO8601}` (nullable per block).
 */

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
/** UA the endpoint expects (a Claude Code client). Static fallback version. */
const USER_AGENT = "claude-code/2.1.0";
/** Keychain service the `claude` CLI stores its credential under (macOS). */
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/**
 * Resolve the Claude OAuth access token, mirroring the desktop shell's
 * credential extraction (`app/src-tauri/src/claude_login/credential.rs`):
 *
 *   1. `<claudeLoginConfigDir>/.credentials.json` — Linux/Windows, hosted pods
 *      (materialized by the desktop push), and some macOS setups;
 *   2. the macOS Keychain (`security find-generic-password`);
 *   3. auth.json — a cloud-served OAuth credential's access token, or the
 *      degraded setup-token fallback (`sk-ant-oat01…`, itself an OAuth token).
 *
 * Returns null when nothing is readable — the row reports `unauthenticated`.
 */
export async function resolveAnthropicToken(
  keychain: () => Promise<string | null> = readKeychainCredential,
): Promise<string | null> {
  const fromFile = tokenFromCredentialJson(readCredentialFile());
  if (fromFile) return fromFile;
  const fromKeychain = tokenFromCredentialJson(await keychain());
  if (fromKeychain) return fromKeychain;
  const cred = authStorage.get("anthropic");
  if (cred?.type === "oauth" && cred.access) return cred.access;
  if (cred?.type === "api_key" && cred.key) return cred.key;
  return null;
}

function readCredentialFile(): string | null {
  try {
    return readFileSync(claudeCredentialsFile(), "utf8");
  } catch {
    return null; // absent on this platform/setup — fall through
  }
}

/** `{claudeAiOauth:{accessToken}}` → the token, or null on any mismatch. */
function tokenFromCredentialJson(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: unknown };
    };
    const token = parsed.claudeAiOauth?.accessToken;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

/** macOS Keychain read; resolves null off macOS or when the item is absent. */
function readKeychainCredential(): Promise<string | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { timeout: 10_000 },
      (err, stdout) => {
        // A non-zero exit (item absent, `security` exits 44) or a spawn
        // failure both mean "no keychain credential" — the caller falls
        // through to auth.json, and a truly-disconnected account surfaces
        // as the row's `unauthenticated` status, never a throw.
        resolve(err ? null : stdout);
      },
    );
  });
}

type OAuthUsageBlock = { utilization?: unknown; resets_at?: unknown } | null;

function toWindow(
  id: ProviderUsageWindow["id"],
  block: OAuthUsageBlock | undefined,
  windowMinutes: number,
): ProviderUsageWindow | null {
  if (!block || typeof block !== "object") return null;
  return {
    id,
    usedPercent: clampPercent(block.utilization),
    resetsAt: typeof block.resets_at === "string" ? block.resets_at : null,
    windowMinutes,
  };
}

/** Fetch the connected Claude account's usage windows. */
export async function fetchAnthropicUsage(
  fetchImpl: typeof fetch = fetch,
  resolveToken: () => Promise<string | null> = resolveAnthropicToken,
): Promise<ProviderUsage> {
  const provider = "anthropic";
  const token = await resolveToken();
  if (!token) return { provider, status: "unauthenticated", windows: [] };

  const res = await fetchImpl(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403)
    return { provider, status: "unauthenticated", windows: [] };
  if (!res.ok) {
    return {
      provider,
      status: "error",
      windows: [],
      message: `Anthropic usage API answered ${res.status}`,
    };
  }
  const body = (await res.json()) as {
    five_hour?: OAuthUsageBlock;
    seven_day?: OAuthUsageBlock;
    seven_day_opus?: OAuthUsageBlock;
  };
  const windows = [
    toWindow("session", body.five_hour, 300),
    toWindow("week", body.seven_day, 10_080),
    toWindow("week_opus", body.seven_day_opus, 10_080),
  ].filter((w): w is ProviderUsageWindow => w !== null);
  return {
    provider,
    status: "ok",
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

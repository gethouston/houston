import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { authStorage } from "../../auth/storage";
import { claudeCredentialsFile } from "../../backends/claude/paths";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import {
  clampPercent,
  type ProviderUsage,
  type ProviderUsageWindow,
  settleWindow,
} from "./types";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const USER_AGENT = "claude-code/2.1.0";
const KEYCHAIN_SERVICE = "Claude Code-credentials";

export async function resolveAnthropicToken(
  keychain: () => Promise<string | null> = readKeychainCredential,
): Promise<string | null> {
  if (!isPersonalScope(currentCredentialScope().key)) {
    const fromFile = tokenFromCredentialJson(readCredentialFile());
    if (fromFile) return fromFile;
    const fromKeychain = tokenFromCredentialJson(await keychain());
    if (fromKeychain) return fromKeychain;
  }
  const cred = authStorage.get("anthropic");
  if (cred?.type === "oauth" && cred.access) return cred.access;
  if (cred?.type === "api_key" && cred.key) return cred.key;
  return null;
}

function readCredentialFile(): string | null {
  try {
    return readFileSync(claudeCredentialsFile(), "utf8");
  } catch {
    return null;
  }
}

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

function readKeychainCredential(): Promise<string | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
      { timeout: 10_000 },
      (err, stdout) => {
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

export async function fetchAnthropicUsage(
  fetchImpl: typeof fetch = fetch,
  resolveToken: () => Promise<string | null> = resolveAnthropicToken,
  now: () => number = Date.now,
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
  ]
    .filter((w): w is ProviderUsageWindow => w !== null)
    .map((w) => settleWindow(w, now()));
  return {
    provider,
    status: "ok",
    windows,
    fetchedAt: new Date(now()).toISOString(),
  };
}

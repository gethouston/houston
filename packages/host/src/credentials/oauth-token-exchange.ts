import type { WorkspaceCredential } from "../ports";

// WHY: Never add invalid_client: a retired shared client id would delete every credential. ADR-0016
const TERMINAL_ERROR_CODES = [
  "invalid_grant",
  "refresh_token_invalidated",
  "invalid_refresh_token",
] as const;

export type TerminalErrorCode = (typeof TERMINAL_ERROR_CODES)[number];

const TERMINAL: ReadonlySet<string> = new Set(TERMINAL_ERROR_CODES);

const isTerminalCode = (code: string): code is TerminalErrorCode =>
  TERMINAL.has(code);

export class RefreshRejectedError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: TerminalErrorCode,
  ) {
    super(message);
    this.name = "RefreshRejectedError";
  }
}

export class TransientRefreshError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransientRefreshError";
  }
}

const PRE_CONNECT_CODES: ReadonlySet<string> = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
]);

function isPreConnectFailure(err: unknown): boolean {
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && PRE_CONNECT_CODES.has(code);
}

export const REFRESH_TIMEOUT_MS = 10_000;

function oauthErrorCode(body: string): string | null {
  let parsed: { error?: unknown };
  try {
    parsed = JSON.parse(body) as { error?: unknown };
  } catch {
    return null;
  }
  if (typeof parsed.error === "string") return parsed.error;
  const nested = (parsed.error as { code?: unknown } | null)?.code;
  return typeof nested === "string" ? nested : null;
}

export async function exchangeRefreshToken(
  cfg: { tokenUrl: string; clientId: string },
  cred: WorkspaceCredential,
): Promise<WorkspaceCredential> {
  let res: Response;
  try {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: cfg.clientId,
        refresh_token: cred.refreshToken,
      }),
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = `OAuth refresh request failed for ${cred.provider}: ${String(err)}`;
    throw isPreConnectFailure(err)
      ? new TransientRefreshError(message, { cause: err })
      : new Error(message, { cause: err });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const message = `OAuth refresh failed (${res.status}) for ${cred.provider}: ${body.slice(0, 200)}`;
    const code = oauthErrorCode(body);
    if (
      (res.status === 400 || res.status === 401) &&
      code !== null &&
      isTerminalCode(code)
    ) {
      throw new RefreshRejectedError(message, res.status, code);
    }
    throw new Error(message);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (
    !json.access_token ||
    !json.refresh_token ||
    typeof json.expires_in !== "number"
  ) {
    throw new Error(
      `OAuth refresh response missing fields for ${cred.provider}`,
    );
  }
  return {
    workspaceId: cred.workspaceId,
    provider: cred.provider,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accountId: cred.accountId,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

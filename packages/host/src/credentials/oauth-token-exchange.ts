import type { WorkspaceCredential } from "../ports";

/**
 * ONE standard `grant_type=refresh_token` exchange against a provider's token
 * endpoint, plus the classification of its failures. Split from `refresh.ts` so
 * the credential-lifecycle policy there (when to refresh, how many times, what
 * the serve route does with each outcome) reads without the HTTP detail.
 */

/**
 * OAuth error codes that condemn the refresh TOKEN itself. `invalid_grant` is
 * RFC 6749's verdict on the grant; `refresh_token_invalidated` is what OpenAI
 * answers when the session was ended server-side (observed — the serve route
 * and its tests have relied on that disconnect since the flow shipped).
 *
 * RFC 6749's `invalid_client` is deliberately ABSENT: it condemns the client
 * credentials we send — one hardcoded public client id shared by every install
 * — not the user's token. Were the provider to retire that id, treating it as
 * terminal would delete every workspace's credential on its next refresh, with
 * no path back.
 */
const TERMINAL_ERROR_CODES = [
  "invalid_grant",
  "refresh_token_invalidated",
] as const;

/** The only codes that may sign a user out. */
export type TerminalErrorCode = (typeof TERMINAL_ERROR_CODES)[number];

const TERMINAL: ReadonlySet<string> = new Set(TERMINAL_ERROR_CODES);

const isTerminalCode = (code: string): code is TerminalErrorCode =>
  TERMINAL.has(code);

/**
 * The token endpoint's verdict on the refresh token itself — a 400/401 whose
 * body names a `TerminalErrorCode`. Unlike a network blip, a 5xx, or an
 * unattributed 4xx from an edge node, this never heals on retry: the credential
 * is dead until the user reconnects the provider. The serve route DELETES the
 * credential on this error, so nothing else may throw it — a misclassified
 * transient failure silently signs the user out.
 */
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

/**
 * A failure that provably happened BEFORE the request left this process, so the
 * grant cannot have been consumed. Only these may be retried.
 *
 * Everything else — a timeout, an abort, a 5xx, a 429, a mid-stream reset — is
 * ambiguous: the endpoint may already have consumed the rotating refresh token
 * and rotated it into a response we never read. Retrying then POSTs a spent
 * grant, earns `invalid_grant`, and the serve route DELETES the user's
 * credential over what was only a blip. Those surface as plain `Error`s: the
 * route serves the stored token best-effort and the next serve tries again.
 */
export class TransientRefreshError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TransientRefreshError";
  }
}

/**
 * Socket-level failure codes that mean no byte of the POST reached the server.
 * `ECONNRESET` is NOT here: a reset can land after the request was written and
 * the grant consumed.
 */
const PRE_CONNECT_CODES: ReadonlySet<string> = new Set([
  "ENOTFOUND", // DNS said the host does not exist
  "EAI_AGAIN", // DNS lookup failed / timed out
  "ECONNREFUSED", // the port answered with a refusal
]);

/**
 * True when a thrown fetch failure provably predates the connection. undici
 * raises `TypeError: fetch failed` and hangs the real reason off `cause`; an
 * `AbortError`/`TimeoutError` DOMException has no such cause and is ambiguous
 * by construction.
 */
function isPreConnectFailure(err: unknown): boolean {
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === "string" && PRE_CONNECT_CODES.has(code);
}

/** A hung token endpoint would otherwise stall every credential serve. */
const REFRESH_TIMEOUT_MS = 10_000;

/**
 * The error code of an OAuth failure body, in either shape we see in the wild:
 * RFC 6749's `{"error":"invalid_grant"}` and OpenAI's nested
 * `{"error":{"code":"refresh_token_invalidated"}}`. An unparseable or otherwise
 * shaped body yields `null`, which keeps the failure non-terminal: we never
 * disconnect a user over a response we could not read. The raw body still
 * reaches them through the thrown message, so nothing is swallowed.
 */
function oauthErrorCode(body: string): string | null {
  let parsed: { error?: unknown };
  try {
    parsed = JSON.parse(body) as { error?: unknown };
  } catch {
    return null; // an HTML error page from an edge node, a truncated body, ...
  }
  if (typeof parsed.error === "string") return parsed.error;
  const nested = (parsed.error as { code?: unknown } | null)?.code;
  return typeof nested === "string" ? nested : null;
}

/**
 * Perform one refresh exchange. Throws `RefreshRejectedError` (terminal — the
 * user must reconnect), `TransientRefreshError` (the request never left this
 * process; safe to retry), or a plain `Error` (stop, but the caller keeps
 * serving the stored token rather than disconnecting).
 */
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
    // A 5xx/429 gets no retry either: the endpoint may have consumed the grant
    // before failing, and a second POST would spend a token we no longer hold.
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
    refreshToken: json.refresh_token, // rotation-safe: persist whatever comes back
    accountId: cred.accountId, // the refresh endpoint doesn't return it; it's stable
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export interface ClaudeOAuthCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  subscriptionType?: string;
}

export interface ClaudeOAuthEnvelope {
  claudeAiOauth: ClaudeOAuthCredential;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseClaudeOAuthEnvelope(
  body: unknown,
): ParseResult<ClaudeOAuthCredential> {
  if (!body || typeof body !== "object")
    return { ok: false, error: "body must be a JSON object" };
  const envelope = (body as { claudeAiOauth?: unknown }).claudeAiOauth;
  if (!envelope || typeof envelope !== "object")
    return { ok: false, error: "missing 'claudeAiOauth' object" };
  const c = envelope as Record<string, unknown>;

  if (typeof c.accessToken !== "string" || !c.accessToken.trim())
    return {
      ok: false,
      error: "claudeAiOauth.accessToken must be a non-empty string",
    };
  if (c.refreshToken !== undefined && typeof c.refreshToken !== "string")
    return { ok: false, error: "claudeAiOauth.refreshToken must be a string" };
  if (
    c.expiresAt !== undefined &&
    (typeof c.expiresAt !== "number" || !Number.isFinite(c.expiresAt))
  )
    return { ok: false, error: "claudeAiOauth.expiresAt must be a number" };
  if (
    c.scopes !== undefined &&
    (!Array.isArray(c.scopes) || !c.scopes.every((s) => typeof s === "string"))
  )
    return {
      ok: false,
      error: "claudeAiOauth.scopes must be an array of strings",
    };
  if (
    c.subscriptionType !== undefined &&
    typeof c.subscriptionType !== "string"
  )
    return {
      ok: false,
      error: "claudeAiOauth.subscriptionType must be a string when present",
    };

  return {
    ok: true,
    value: {
      accessToken: c.accessToken,
      ...(c.refreshToken !== undefined
        ? { refreshToken: c.refreshToken as string }
        : {}),
      ...(c.expiresAt !== undefined
        ? { expiresAt: c.expiresAt as number }
        : {}),
      ...(c.scopes !== undefined
        ? { scopes: [...(c.scopes as string[])] }
        : {}),
      ...(c.subscriptionType !== undefined
        ? { subscriptionType: c.subscriptionType as string }
        : {}),
    },
  };
}

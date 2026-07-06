/**
 * The Claude subscription OAuth credential, in Anthropic's own CLI
 * `.credentials.json` format.
 *
 * `claude auth login` mints this on the DESKTOP and caches it locally. For a
 * LOCAL engine the Claude Agent SDK reads it directly. For a HOSTED engine the
 * pod can't reach the user's machine, so the desktop EXTRACTS this credential
 * and PUSHES it to the pod (`POST /agents/:id/credential/claude-oauth`); the pod
 * materializes it as `<CLAUDE_CONFIG_DIR>/.credentials.json` and its SDK
 * authenticates AND self-refreshes from the refresh token in place.
 *
 * The wire shape is the CLI's file verbatim (the `claudeAiOauth` envelope),
 * carried unchanged desktop → host → pod → disk. Keeping ONE shape end-to-end
 * means no lossy re-encoding can corrupt what the SDK reads.
 */
export interface ClaudeOAuthCredential {
  accessToken: string;
  /**
   * The refresh token that lets the pod's SDK self-refresh in place. Present in
   * a normal Claude subscription credential (and the whole point of the cloud
   * handoff), but OPTIONAL at the type level: we must not reject a real minted
   * credential over a field the SDK, not Houston, ultimately interprets. Without
   * it the access token still works until it expires (degraded, not broken).
   */
  refreshToken?: string;
  /** Unix epoch MILLISECONDS the access token expires (as the CLI wrote it). */
  expiresAt?: number;
  scopes?: string[];
  /** e.g. "max" / "pro". */
  subscriptionType?: string;
}

/** The CLI's on-disk envelope: `{ claudeAiOauth: { … } }`. */
export interface ClaudeOAuthEnvelope {
  claudeAiOauth: ClaudeOAuthCredential;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Validate an untrusted `{ claudeAiOauth: {…} }` envelope. The ONE hard
 * requirement is a non-empty `accessToken` — that is what makes it a credential.
 * `refreshToken`, `expiresAt`, and `scopes` are OPTIONAL: a normal Claude
 * subscription credential carries them, but Houston must not 400 a real minted
 * credential over a field the Claude Agent SDK — not Houston — interprets from
 * the verbatim file (rejecting would send every user to the paste fallback and
 * the headline feature would never work). When a field IS present it is
 * type-checked (garbage is still rejected loudly) and carried through; when
 * absent it is omitted so the written file stays byte-faithful to what the CLI
 * would have produced. No extra keys are carried through.
 */
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

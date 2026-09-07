/**
 * Whether a tool's OWN failure text says the credential was refused. MCP
 * servers report a rejected token inside a successful `tools/call` (an
 * `isError` result — HighLevel answers `{"status": 401, "message": "Invalid
 * Private Integration token"}` this way, verified live), so the executor
 * sees no HTTP 401 and never classifies it as an authentication failure.
 * Without this the user sees a connected card and a run that keeps failing,
 * with no way back to the key-entry hand-off. Deliberately narrow, because
 * a false positive sends the user to re-enter a key that works: an explicit
 * HTTP/status 401, or a credential NAMED as one (API key, access token, …)
 * called invalid, expired or revoked. A bare "unauthorized", "invalid key"
 * or a 401 inside other words ("Contact 401 not found") is not enough, and
 * a 403 is a permissions answer, not a bad credential.
 */
const CREDENTIAL =
  "(?:api[ _-]?key|access[ _-]?token|bearer[ _-]?token|auth(?:entication|orization)?[ _-]?token|private integration token|refresh[ _-]?token|api[ _-]?token|secret[ _-]?key)";

const AUTH_FAILURE = [
  // "status": 401 / statusCode: 401 / HTTP 401 / status 401 / error 401
  /\b(?:status(?:[ _-]?code)?|http|error)["']?\s*[:=]?\s*["']?401\b/i,
  /\b401\s+unauthori[sz]ed\b/i,
  new RegExp(
    `\\b(?:invalid|expired|revoked|bad|missing) ${CREDENTIAL}s?\\b`,
    "i",
  ),
  new RegExp(
    `\\b${CREDENTIAL}s? (?:is |are |has |was |have )?(?:invalid|expired|revoked|not valid|been revoked|missing)\\b`,
    "i",
  ),
];

export function looksLikeAuthFailure(message: string): boolean {
  return AUTH_FAILURE.some((re) => re.test(message));
}

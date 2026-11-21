const CREDENTIAL =
  "(?:api[ _-]?key|access[ _-]?token|bearer[ _-]?token|auth(?:entication|orization)?[ _-]?token|private integration token|refresh[ _-]?token|api[ _-]?token|secret[ _-]?key)";

const AUTH_FAILURE = [
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

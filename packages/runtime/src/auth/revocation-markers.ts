/**
 * Message markers that CONFIRM a server-side revocation — the ONLY texts allowed
 * to trigger the workspace-wide delete (`report-revoked.ts`).
 *
 * `token_revoked` is deliberately generous on the CARD side: both classifiers
 * (`ai/provider-error.ts` and `backends/claude/errors.ts`) also map loose
 * phrasings — "your session has ended", "please log in again" — to it, because
 * "your access was revoked, sign in again" is the right thing to SAY about any
 * terminal-looking 401. It is not the right thing to DO: providers reach for
 * that copy for transient auth blips too, and one such turn would otherwise
 * delete the credential for every runtime in the workspace.
 *
 * So presentation and destruction are split here, and the destructive half
 * takes only unambiguous, machine-emitted revocation markers:
 *  - `token_revoked` — the structured code providers return for it.
 *  - `has been revoked` / `access revoked` — the provider stating it outright in
 *    prose ("401 OAuth access token has been revoked"). ANCHORED phrases, never
 *    the bare word: "revoked" alone also matches a NEGATION ("the scope was not
 *    revoked") and unrelated fields ("revoked_scopes": []), each of which would
 *    delete a live credential for the whole workspace. Neither anchored phrase
 *    survives a negation — "has not been revoked" does not contain "has been
 *    revoked".
 *  - `app_session_terminated` — ChatGPT/Codex's structured code for a login
 *    session killed server-side (it rides ALONG with the loose prose above,
 *    which is exactly why the code, not the prose, is the signal).
 *  - `refresh_token_invalidated` — OpenAI's code for the same thing on the token
 *    endpoint; the host treats it as terminal too (`credentials/oauth-token-exchange.ts`).
 *
 * Prose like "session terminated" is deliberately NOT here: the harm is
 * lopsided. A missed report costs the user a manual reconnect (the pre-HOU-952
 * status quo); a false one destroys a working credential workspace-wide.
 */
const REVOCATION_CONFIRMED_PATTERNS = [
  "token_revoked",
  "has been revoked",
  "access revoked",
  "app_session_terminated",
  "refresh_token_invalidated",
];

/** Whether the provider's own words CONFIRM a server-side revocation. */
export function revocationConfirmed(message: string): boolean {
  const lower = message.toLowerCase();
  return REVOCATION_CONFIRMED_PATTERNS.some((p) => lower.includes(p));
}

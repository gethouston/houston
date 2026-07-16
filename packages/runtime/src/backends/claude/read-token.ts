import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { ANTHROPIC_TOKEN_PREFIXES } from "../../auth/anthropic-setup-token";
import type { ClaudeToken } from "./backend";

/**
 * Resolve the stored `anthropic` credential into the `ClaudeToken` the Claude
 * Agent SDK backend runs with. Two stored variants map here:
 *
 *  - The setup-token flow stores the pasted value under `anthropic` as pi's
 *    `api_key` variant (see auth/anthropic-setup-token.ts).
 *  - The connect-once serve path (managed cloud) writes pi's `oauth` variant
 *    with a short-TTL ACCESS token and refresh="" (Gate #2) — the control
 *    plane is the single refresher, the pod never holds the refresh token.
 *
 * Either way the SDK consumes the value through env vars, and WHICH var is
 * selected by the token's prefix: a subscription OAuth/setup token
 * (`sk-ant-oat01…`) rides `CLAUDE_CODE_OAUTH_TOKEN`, a console API key
 * (`sk-ant-api03…`) rides `ANTHROPIC_API_KEY`. Mapped here, once, off the SAME
 * prefix list the login validator uses. The env token deliberately outranks
 * whatever `.credentials.json`/Keychain state the config dir carries — a stale
 * materialized file can never shadow a freshly served token.
 *
 * No silent failure: an absent credential returns `undefined` (not connected —
 * expected), but a STORED value we can't classify (unexpected PiCred variant,
 * or an unrecognized prefix) returns `undefined` AND logs the concrete reason,
 * so a bad/corrupt entry surfaces in the logs instead of vanishing.
 */
const [OAUTH_TOKEN_PREFIX, API_KEY_PREFIX] = ANTHROPIC_TOKEN_PREFIXES;

function classify(value: string): ClaudeToken | undefined {
  if (value.startsWith(OAUTH_TOKEN_PREFIX))
    return { kind: "oauth-token", value };
  if (value.startsWith(API_KEY_PREFIX)) return { kind: "api-key", value };
  console.warn(
    `[claude] stored "anthropic" token has an unrecognized prefix (expected ${OAUTH_TOKEN_PREFIX}… or ${API_KEY_PREFIX}…); refusing to use it`,
  );
  return undefined;
}

export function readAnthropicToken(
  store: Pick<AuthStorage, "get">,
): ClaudeToken | undefined {
  const cred = store.get("anthropic");
  if (!cred) return undefined; // not connected — no credential to read

  if (cred.type === "api_key") return classify(cred.key.trim());
  if (cred.type === "oauth") {
    const access = cred.access?.trim();
    if (!access) {
      console.warn(
        `[claude] stored "anthropic" oauth credential has an empty access token; ignoring it`,
      );
      return undefined;
    }
    // Last line of defense: never hand the SDK an EXPIRED served token. The
    // env token outranks the config dir's self-refreshing credential, so a
    // stale entry that slipped past the host's serve guards (a control plane
    // that can't refresh anthropic yet, an orphaned entry) would shadow a
    // WORKING file/keychain credential. Returning undefined instead lets the
    // SDK fall back to the config dir. expires=0 means "no expiry recorded"
    // (a pasted token stored as oauth) and is served as-is.
    if (cred.expires > 0 && cred.expires <= Date.now()) {
      console.warn(
        `[claude] stored "anthropic" oauth access token is expired; falling back to the config dir credential`,
      );
      return undefined;
    }
    return classify(access);
  }

  console.warn(
    `[claude] stored "anthropic" credential is a "${(cred as { type: string }).type}" entry, expected api_key or oauth; ignoring it`,
  );
  return undefined;
}

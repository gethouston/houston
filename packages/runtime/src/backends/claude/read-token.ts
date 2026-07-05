import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { ANTHROPIC_TOKEN_PREFIXES } from "../../auth/anthropic-setup-token";
import type { ClaudeToken } from "./backend";

/**
 * Resolve the stored `anthropic` credential into the `ClaudeToken` the Claude
 * Agent SDK backend runs with. The setup-token flow stores the pasted value under
 * `anthropic` as pi's `api_key` variant (see auth/anthropic-setup-token.ts), and
 * the SDK consumes the two token kinds through DIFFERENT env vars — a subscription
 * setup token (`sk-ant-oat01…`) via `CLAUDE_CODE_OAUTH_TOKEN`, a console API key
 * (`sk-ant-api03…`) via `ANTHROPIC_API_KEY` — so the prefix is what selects the
 * env var. Mapped here, once, off the SAME prefix list the login validator uses.
 *
 * No silent failure: an absent credential returns `undefined` (not connected —
 * expected), but a STORED value we can't classify (wrong PiCred variant, or an
 * unrecognized prefix) returns `undefined` AND logs the concrete reason, so a
 * bad/corrupt entry surfaces in the logs instead of vanishing.
 */
const [OAUTH_TOKEN_PREFIX, API_KEY_PREFIX] = ANTHROPIC_TOKEN_PREFIXES;

export function readAnthropicToken(
  store: Pick<AuthStorage, "get">,
): ClaudeToken | undefined {
  const cred = store.get("anthropic");
  if (!cred) return undefined; // not connected — no credential to read

  if (cred.type !== "api_key") {
    console.warn(
      `[claude] stored "anthropic" credential is a "${cred.type}" entry, expected api_key; ignoring it`,
    );
    return undefined;
  }

  const value = cred.key.trim();
  if (value.startsWith(OAUTH_TOKEN_PREFIX))
    return { kind: "oauth-token", value };
  if (value.startsWith(API_KEY_PREFIX)) return { kind: "api-key", value };

  console.warn(
    `[claude] stored "anthropic" token has an unrecognized prefix (expected ${OAUTH_TOKEN_PREFIX}… or ${API_KEY_PREFIX}…); refusing to use it`,
  );
  return undefined;
}

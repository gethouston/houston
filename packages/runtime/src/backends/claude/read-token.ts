import { accessDigest } from "@houston/protocol/access-digest";
import { ANTHROPIC_TOKEN_PREFIXES } from "../../auth/anthropic-setup-token";
import type { HoustonAuthStore } from "../../auth/credential-store";
import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import type { ClaudeToken } from "./backend";
import { readClaudeOAuthCredentialFile } from "./credentials-file";
import { claudeCredentialsFile } from "./paths";

/**
 * Resolve the `anthropic` credential into the `ClaudeToken` the Claude Agent SDK
 * backend runs with. Two stored variants map here:
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
 * No silent failure: an absent store entry falls through to the rest of the
 * chain (`readAnthropicToken` below) quietly — not connected here is expected —
 * but a STORED value we can't classify (unexpected PiCred variant, or an
 * unrecognized prefix) falls through AND logs the concrete reason, so a
 * bad/corrupt entry surfaces in the logs instead of vanishing.
 *
 * SCOPE (HOU-976): `store.get` resolves the ambient acting identity, so on a
 * shared pod this returns the ACTING member's anthropic token — read inside the
 * turn's async subtree by every caller (conversation-cache, summarize,
 * anonymize). The shared-login-dir fallback below is TEAM-scope only, mirroring
 * the write refusal in `credentials-file.ts`.
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

/**
 * Resolve the credential the desktop login materialized into the SHARED login
 * dir (`<HOUSTON_HOME>/claude-login/.credentials.json`) — the second link of the
 * chain documented on `readAnthropicToken`.
 *
 * A login pushes its credential to ONE runtime, which persists it in THAT
 * agent's `auth.json`. Every other agent's runtime has no store entry, and on
 * macOS/Windows the platform config-dir mechanism is the OS keychain, which the
 * push never writes — so without this link one login heals exactly one agent and
 * every other agent 401s `token_expired` forever. Reading the shared file here
 * makes one login heal EVERY agent's runtime. On Linux it is a no-op in effect:
 * the SDK reads the very same file from `CLAUDE_CONFIG_DIR`.
 *
 * Only an UNEXPIRED access token qualifies. The env token OUTRANKS the config
 * dir inside the SDK, so serving an expired one would shadow a credential the
 * SDK could still refresh in place — strictly worse than resolving nothing.
 * `expiresAt` absent/0 means "no expiry recorded" and is served as-is, matching
 * the store branch's `expires=0` rule.
 *
 * SCOPE (HOU-976): this file is POD-WIDE, so on a managed pod it holds the
 * TEAM's credential. A PERSONAL scope therefore resolves nothing here — the
 * read-side mirror of `writeClaudeOAuthCredentialFile`'s refusal — and the
 * member's turn surfaces the honest "not connected" card (scope-guard.ts)
 * instead of silently running on, and billing, the team account.
 *
 * No access digest: the revoked-token report is gated to oauth-typed STORE
 * entries, and a config-dir credential has none to report against.
 */
function readSharedLoginFileToken(): ClaudeToken | undefined {
  if (isPersonalScope(currentCredentialScope().key)) return undefined;
  const cred = readClaudeOAuthCredentialFile(claudeCredentialsFile());
  if (!cred) return undefined; // absent, unreadable, or not the CLI envelope
  const expires = cred.expiresAt ?? 0;
  if (expires > 0 && expires <= Date.now()) return undefined;
  // The envelope's own type is the classification: `claudeAiOauth` is a
  // subscription OAuth credential, which rides `CLAUDE_CODE_OAUTH_TOKEN`.
  return { kind: "oauth-token", value: cred.accessToken.trim() };
}

/**
 * The anthropic credential this runtime authenticates the SDK with, resolved in
 * strict precedence order:
 *
 *  1. the STORE entry (`auth.json`), when unexpired — the freshest credential
 *     this agent was served or connected with;
 *  2. the SHARED login dir's `.credentials.json`, when unexpired — one login,
 *     every agent (`readSharedLoginFileToken`);
 *  3. nothing, which hands the turn to the platform's own config-dir mechanism
 *     inside the SDK (the `.credentials.json` it self-refreshes on Linux, the
 *     dir-scoped keychain item on macOS/Windows).
 *
 * Each link falls through to the next on ANY unusable value — expired, empty,
 * malformed, or absent — so a broken credential can never shadow a working one.
 */
export function readAnthropicToken(
  store: Pick<HoustonAuthStore, "get">,
): ClaudeToken | undefined {
  return readStoredAnthropicToken(store) ?? readSharedLoginFileToken();
}

/** Link 1: the `anthropic` entry in this runtime's own credential store. */
function readStoredAnthropicToken(
  store: Pick<HoustonAuthStore, "get">,
): ClaudeToken | undefined {
  const cred = store.get("anthropic");
  if (!cred) return undefined; // not connected — no credential to read

  if (cred.type === "api_key") {
    // pi ≥0.81 allows a keyless `api_key` entry (provider-env-only, e.g. an
    // AWS profile). Anthropic's setup-token flow always stores a key, so an
    // empty one is a corrupt entry — surface it, don't classify "".
    const key = cred.key?.trim();
    if (!key) {
      console.warn(
        `[claude] stored "anthropic" api_key credential has no key; refusing to use it`,
      );
      return undefined;
    }
    return classify(key);
  }
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
    // WORKING file/keychain credential. Returning undefined instead hands the
    // turn to the next link of the chain. expires=0 means "no expiry recorded"
    // (a pasted token stored as oauth) and is served as-is.
    if (cred.expires > 0 && cred.expires <= Date.now()) {
      console.warn(
        `[claude] stored "anthropic" oauth access token is expired; falling back to the shared login dir credential`,
      );
      return undefined;
    }
    const token = classify(access);
    if (!token) return undefined;
    // Capture WHICH token the subprocess will run on, digested at spawn
    // preparation: the revoked-token report must name this token, not
    // whatever auth.json holds when a turn later fails (PRODUCT-1319).
    // OAUTH-typed store entries only — mirroring the reporter's oauth gate —
    // so the api_key branch above stays digest-less by design.
    return { ...token, accessDigest: accessDigest(access) };
  }

  console.warn(
    `[claude] stored "anthropic" credential is a "${(cred as { type: string }).type}" entry, expected api_key or oauth; ignoring it`,
  );
  return undefined;
}

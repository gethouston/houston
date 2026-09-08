import {
  currentCredentialScope,
  isPersonalScope,
} from "../../session/acting-context";
import type { ClaudeToken } from "./backend";
import { readClaudeOAuthCredentialFile } from "./credentials-file";
import { claudeCredentialsFile } from "./paths";

/**
 * THE SHARED LOGIN — `<HOUSTON_HOME>/claude-login/.credentials.json`, the ONE
 * file a Claude login lands in for every agent on this machine or pod.
 *
 * A login pushes its credential to ONE runtime, which persists it in THAT
 * agent's `auth.json`. Every other agent's runtime has no store entry, and on
 * macOS/Windows the platform config-dir mechanism is the OS keychain, which the
 * push never writes — so without this file one login would heal exactly one
 * agent and every other agent would 401 forever. On Linux it is a no-op in
 * effect: the SDK reads the very same file from `CLAUDE_CONFIG_DIR`.
 *
 * It is also the LOGIN GENERATION every runtime agrees on. A runtime holding an
 * unexpired token of its own would otherwise keep preferring it after the user
 * reconnected somewhere else — running as the account they just left, or 401ing
 * on a token that reconnect superseded, with no way out but an expiry hours
 * away. So a shared login that is demonstrably NEWER than the runtime's own
 * copy wins over it (`sharedLoginSupersedes`), and one that is not is ignored.
 *
 * SCOPE (HOU-976): this file is POD-WIDE, so on a managed pod it holds the
 * TEAM's credential. A PERSONAL scope therefore resolves nothing here — the
 * read-side mirror of `writeClaudeOAuthCredentialFile`'s refusal — and the
 * member's turn surfaces the honest "not connected" card (scope-guard.ts)
 * instead of silently running on, and billing, the team account.
 */

/** A usable shared credential, with the expiry that orders it against others. */
export interface SharedLogin {
  token: ClaudeToken;
  /** Unix epoch ms; 0 when the file records no expiry. */
  expiresAt: number;
}

/**
 * The shared login dir's credential, when it can still authenticate a turn.
 *
 * Only an UNEXPIRED access token qualifies. The env token OUTRANKS the config
 * dir inside the SDK, so serving an expired one would shadow a credential the
 * SDK could still refresh in place — strictly worse than resolving nothing.
 * `expiresAt` absent/0 means "no expiry recorded" and is served as-is, matching
 * the store branch's `expires=0` rule.
 *
 * No access digest: the revoked-token report is gated to oauth-typed STORE
 * entries, and a config-dir credential has none to report against.
 */
export function readSharedLogin(
  now: number = Date.now(),
): SharedLogin | undefined {
  if (isPersonalScope(currentCredentialScope().key)) return undefined;
  const cred = readClaudeOAuthCredentialFile(claudeCredentialsFile());
  if (!cred) return undefined; // absent, unreadable, or not the CLI envelope
  const expiresAt = cred.expiresAt ?? 0;
  if (expiresAt > 0 && expiresAt <= now) return undefined;
  const value = cred.accessToken.trim();
  if (!value) return undefined;
  // The envelope's own type is the classification: `claudeAiOauth` is a
  // subscription OAuth credential, which rides `CLAUDE_CODE_OAUTH_TOKEN`.
  return { token: { kind: "oauth-token", value }, expiresAt };
}

/** The runtime's own stored OAuth credential, as this comparison sees it. */
export interface StoredLogin {
  value: string;
  /** Unix epoch ms the stored access token expires; 0 = none recorded. */
  expires: number;
}

/**
 * Whether the shared login is a LATER login than the runtime's own copy, and so
 * the one this runtime must authenticate with.
 *
 * Two conditions, both required:
 *
 *  - it is a DIFFERENT access token. The same token from two sinks is one
 *    login, and preferring either is the same thing.
 *  - it expires LATER. Anthropic issues access tokens with a fixed lifetime, so
 *    a later expiry is a later issuance — the only ordering both sinks record.
 *    A file with no expiry recorded can never prove it is newer and so never
 *    wins; the runtime keeps what it has.
 *
 * The asymmetry is deliberate. Preferring the file whenever the two merely
 * DIFFER would let a stale file (an old login this machine never cleaned up)
 * beat a credential the gateway just served, which is the same bug facing the
 * other way. Only a provable ordering may move a runtime off its own token.
 */
export function sharedLoginSupersedes(
  shared: SharedLogin,
  stored: StoredLogin,
): boolean {
  return (
    shared.token.value !== stored.value && shared.expiresAt > stored.expires
  );
}

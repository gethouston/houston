/**
 * The desktop → cloud Anthropic credential push, with its retry loop, as a
 * dependency-injected function so the whole thing is node-testable
 * (`app/tests/claude-credential-push.test.ts`). The surrounding
 * `claude-login-remote` module drags the Tauri/store import chain, exactly like
 * the sibling `claude-push-retry`.
 */

import {
  isTransientPushError,
  PUSH_RETRY_DELAYS_MS,
} from "./claude-push-retry.ts";

/** The engine method this drives: `HoustonClient.pushClaudeOAuthCredential`. */
export type ClaudeCredentialPush = (credentialJson: string) => Promise<void>;

export type ClaudeCredentialPushResult =
  | { ok: true }
  | { ok: false; error: unknown };

/**
 * Push once, retrying only TRANSIENT failures (a waking pod, a gateway blip) on
 * the shared backoff. Never throws: the caller decides how loud the outcome is,
 * because on the desktop a failure settles into a standard error surface (see
 * `claude-login-settle`) rather than a dead spinner.
 *
 * `sleep` and `onRetry` are injectable so a test can run the loop without waiting
 * and without a logger.
 */
export async function pushClaudeCredentialWithRetry(opts: {
  push: ClaudeCredentialPush;
  credentialJson: string;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number) => void;
}): Promise<ClaudeCredentialPushResult> {
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      await opts.push(opts.credentialJson);
      return { ok: true };
    } catch (error) {
      const delay = PUSH_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransientPushError(error)) {
        return { ok: false, error };
      }
      opts.onRetry?.(attempt + 1, delay);
      await sleep(delay);
    }
  }
}

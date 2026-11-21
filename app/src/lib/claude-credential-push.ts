import {
  isTransientPushError,
  PUSH_RETRY_DELAYS_MS,
} from "./claude-push-retry.ts";

export type ClaudeCredentialPush = (credentialJson: string) => Promise<void>;

export type ClaudeCredentialPushResult =
  | { ok: true }
  | { ok: false; error: unknown };

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

import type { CustomOAuthAttempt } from "./oauth-flow";

export class CustomOAuthAttempts {
  private readonly byState = new Map<string, CustomOAuthAttempt>();

  put(state: string, attempt: CustomOAuthAttempt): void {
    for (const [key, value] of this.byState) {
      if (value.slug === attempt.slug) this.byState.delete(key);
    }
    this.byState.set(state, attempt);
  }

  pendingCount(now = Date.now()): number {
    let count = 0;
    for (const attempt of this.byState.values())
      if (now <= attempt.expiresAtMs) count++;
    return count;
  }

  take(state: string): CustomOAuthAttempt | null {
    const attempt = this.byState.get(state);
    this.byState.delete(state);
    if (!attempt || Date.now() > attempt.expiresAtMs) return null;
    return attempt;
  }
}

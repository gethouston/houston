/**
 * The `error_kind` taxonomy: what a failure message is really about, read off
 * the message itself. It is what makes `app_error_shown` countable by cause —
 * a free-text message would give every error its own bucket.
 *
 * Its own module (and free of every browser dep) so the classifier can be
 * driven straight from a node test, and so the one place a new message
 * pattern is added is obvious.
 */

export function classifyAnalyticsError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("auth") ||
    lower.includes("token") ||
    lower.includes("login")
  )
    return "auth";
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout") ||
    // WebKit's transport-failure message (HOU-1085) names neither "network"
    // nor "fetch" — without this line an offline burst classifies as unknown.
    lower.includes("load failed")
  )
    return "network";
  if (lower.includes("permission") || lower.includes("denied"))
    return "permission";
  if (
    lower.includes("provider") ||
    lower.includes("openai") ||
    lower.includes("anthropic")
  )
    return "provider";
  if (
    lower.includes("unknown option") ||
    lower.includes("enoent") ||
    lower.includes("spawn") ||
    lower.includes("not found") ||
    lower.includes("claude hit a runtime error") ||
    lower.includes("codex hit a runtime error")
  ) {
    return "cli";
  }
  return "unknown";
}

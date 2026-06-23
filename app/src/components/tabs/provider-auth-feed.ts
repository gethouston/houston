import type { FeedItem } from "@houston-ai/chat";

const AUTH_PATTERNS = [
  "401",
  "unauthorized",
  "not authenticated",
  "not logged in",
  "authentication expired",
  "auth expired",
  "session expired",
  "oauth token",
  "missing bearer",
  "invalid api key",
  "invalid_api_key",
  "please login",
  "please log in",
  "please run /login",
  // The new (TypeScript) engine refuses a turn whose provider has no
  // credential with a verbatim "No provider connected. Log in with Claude or
  // Codex first." / "...Connect your subscription first." (runtime
  // `ai/providers.ts`, `transport/server.ts`, `turn/server.ts`). Unlike the
  // Rust engine it emits NO `AuthRequired` event, so this feed message is the
  // ONLY signal that the chat's provider was logged out — recognizing it here
  // is what surfaces the in-chat reconnect card on the new stack.
  "no provider connected",
] as const;

export function isProviderAuthMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function isProviderAuthFeedItem(item: FeedItem): boolean {
  switch (item.feed_type) {
    case "assistant_text":
    case "assistant_text_streaming":
    case "system_message":
      return (
        item.data === "Checking connection..." ||
        isProviderAuthMessage(item.data)
      );
    case "tool_result":
      return isProviderAuthMessage(item.data.content);
    case "final_result":
      return isProviderAuthMessage(item.data.result);
    default:
      return false;
  }
}

function isProviderAuthSessionError(item: FeedItem): boolean {
  return (
    item.feed_type === "system_message" &&
    item.data.startsWith("Session error:")
  );
}

export function filterProviderAuthFeedItems(items: FeedItem[]): FeedItem[] {
  const hasAuthSignal = providerAuthSignalKey(items) !== null;
  return items.filter(
    (item) =>
      !isProviderAuthFeedItem(item) &&
      !(hasAuthSignal && isProviderAuthSessionError(item)),
  );
}

export function providerAuthSignalKey(items: FeedItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (isProviderAuthFeedItem(item)) {
      return `${index}:${item.feed_type}`;
    }
  }
  return null;
}

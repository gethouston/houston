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
  "no provider connected",
  "no local model configured",
] as const;

const AUTH_PATTERN_RES = AUTH_PATTERNS.map(
  (pattern) =>
    new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
);

export function isProviderAuthMessage(message: string): boolean {
  return AUTH_PATTERN_RES.some((re) => re.test(message));
}

const MODEL_WORK = new Set(["thinking", "thinking_streaming", "tool_call"]);

function modelRanByRow(items: FeedItem[]): boolean[] {
  const ran: boolean[] = new Array(items.length).fill(false);
  let start = 0;
  const close = (end: number) => {
    const worked = items
      .slice(start, end)
      .some((item) => MODEL_WORK.has(item.feed_type));
    ran.fill(worked, start, end);
  };
  items.forEach((item, index) => {
    if (item.feed_type !== "user_message") return;
    close(index);
    start = index;
  });
  close(items.length);
  return ran;
}

function isProviderAuthFeedItem(item: FeedItem, modelRan: boolean): boolean {
  switch (item.feed_type) {
    case "system_message":
      return (
        item.data === "Checking connection..." ||
        isProviderAuthMessage(item.data)
      );
    case "assistant_text":
    case "assistant_text_streaming":
      return (
        !modelRan &&
        (item.data === "Checking connection..." ||
          isProviderAuthMessage(item.data))
      );
    case "final_result":
      return !modelRan && isProviderAuthMessage(item.data.result);
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
  const ran = modelRanByRow(items);
  return items.filter(
    (item, index) =>
      !isProviderAuthFeedItem(item, ran[index]) &&
      !(hasAuthSignal && isProviderAuthSessionError(item)),
  );
}

export function providerAuthSignalKey(items: FeedItem[]): string | null {
  const ran = modelRanByRow(items);
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (isProviderAuthFeedItem(item, ran[index])) {
      return `${index}:${item.feed_type}`;
    }
  }
  return null;
}

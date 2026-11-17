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
  // The runtime refuses a turn pinned to the OpenAI-compatible provider whose
  // endpoint was disconnected with a verbatim "No local model configured. Set
  // a base URL and model for the OpenAI-compatible provider." (runtime
  // `ai/openai-compatible.ts`). Same situation as "no provider connected":
  // no AuthRequired event fires, so this feed message is the only signal —
  // recognizing it is what surfaces the in-chat reconnect card (which routes
  // openai-compatible to the local-model dialog, not OAuth).
  "no local model configured",
] as const;

/**
 * Match each pattern on WORD BOUNDARIES, not as a bare substring: a raw
 * `.includes("401")` fired inside any token that merely contained the digits —
 * fatally, inside a hex UUID like `…d96401409c01…`. The routine-setup kickoff
 * embeds the chat's activity UUID (`setup_activity_id`) in its prompt, and the
 * agent's reply can echo it, so a conversation whose id happened to contain
 * `401` had its whole reply misread as an auth error and hidden — the chat
 * rendered empty (HOU-734). Boundaries keep the intended hits (`Error 401:`,
 * `401 Unauthorized`) while a code buried in a longer alphanumeric run no
 * longer matches. The patterns start and end with word characters, so `\b`
 * anchors both ends cleanly.
 */
const AUTH_PATTERN_RES = AUTH_PATTERNS.map(
  (pattern) =>
    new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
);

export function isProviderAuthMessage(message: string): boolean {
  return AUTH_PATTERN_RES.some((re) => re.test(message));
}

/** Rows only a model that is signed in can produce. */
const MODEL_WORK = new Set(["thinking", "thinking_streaming", "tool_call"]);

/**
 * Whether each row's turn shows the model working. A provider that refuses
 * the credential never runs the model, so a turn that thought or called a
 * tool is signed in, and its words are the model's own: a reply telling the
 * person "Please log in in the browser" during a browser hand-off is not an
 * auth failure. A turn runs from one user message to the next.
 */
function modelRanByRow(items: FeedItem[]): boolean[] {
  const ran: boolean[] = Array.from({ length: items.length }, () => false);
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

/**
 * Whether a row is the provider's auth failure. A tool's result never is: it
 * is what the tool saw, such as a web page asking its visitor to log in. The
 * model's words count only from a turn where the model never ran.
 */
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

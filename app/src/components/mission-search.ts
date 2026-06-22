import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import {
  extractSnippet,
  foldForSearch,
  type MissionSnippet,
  matchesPhrase,
} from "./mission-highlight.ts";

export interface MissionSearchResult<T> {
  items: T[];
  hasQuery: boolean;
  /** `item.id` -> matched body/history fragment, shown below the mission when
   *  the phrase was found there rather than in the title. Title matches get no
   *  snippet (the title already shows the phrase) and the title is never
   *  highlighted. */
  snippets: Record<string, MissionSnippet>;
}

/** Fold + collapse internal whitespace so a multi-word query is matched as a
 *  single phrase (e.g. "this   month" -> "this month"). */
export function normalizeMissionSearchQuery(value: string): string {
  return foldForSearch(value).replace(/\s+/g, " ").trim();
}

function feedValueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function feedItemToSearchText(item: FeedItem): string {
  switch (item.feed_type) {
    // The user's own messages are part of the searchable conversation.
    case "user_message":
      return item.data;
    case "tool_call":
      return `${item.data.name} ${feedValueToText(item.data.input)}`;
    case "tool_result":
      return item.data.content;
    case "tool_runtime_error":
      return "";
    case "file_changes":
      return [...item.data.created, ...item.data.modified].join("\n");
    case "final_result":
      return item.data.result;
    default:
      return feedValueToText(item.data);
  }
}

export function buildMissionHistorySearchText(items: FeedItem[]): string {
  return items.map(feedItemToSearchText).filter(Boolean).join("\n");
}

export function searchMissions<T extends KanbanItem>(
  items: T[],
  rawQuery: string,
  historyTextById: Record<string, string> = {},
): MissionSearchResult<T> {
  const query = normalizeMissionSearchQuery(rawQuery);
  if (!query) {
    return { items, hasQuery: false, snippets: {} };
  }

  const snippets: Record<string, MissionSnippet> = {};
  const matched = items.filter((item) => {
    // A title match speaks for itself: keep it, show no snippet, and (per #411)
    // never highlight the title.
    if (matchesPhrase(item.title, query)) return true;
    // Otherwise search the body + loaded chat history (which includes the
    // user's own messages) and, on a match, surface a snippet showing why.
    const text = [item.description, historyTextById[item.id]]
      .filter(Boolean)
      .join("\n");
    if (!matchesPhrase(text, query)) return false;
    const snippet = extractSnippet(text, query);
    if (snippet) snippets[item.id] = snippet;
    return true;
  });

  return { items: matched, hasQuery: true, snippets };
}

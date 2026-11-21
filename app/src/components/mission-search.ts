import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import {
  foldForSearch,
  type MissionSnippet,
  matchesPhrase,
} from "./mission-highlight.ts";
import {
  matchesSearchable,
  type SearchableText,
  snippetFor,
  toSearchableText,
} from "./mission-search-text.ts";

export interface MissionSearchResult<T> {
  items: T[];
  hasQuery: boolean;
  snippets: Record<string, MissionSnippet>;
}

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
    case "user_message":
      return item.data;
    case "tool_call":
      return `${item.data.name} ${feedValueToText(item.data.input)}`;
    case "tool_result":
      return item.data.content;
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
  historyById: Record<string, SearchableText> = {},
): MissionSearchResult<T> {
  const query = normalizeMissionSearchQuery(rawQuery);
  if (!query) {
    return { items, hasQuery: false, snippets: {} };
  }

  const snippets: Record<string, MissionSnippet> = {};
  const matched = items.filter((item) => {
    if (matchesPhrase(item.title, query)) return true;
    const bodies = [
      item.description ? toSearchableText(item.description) : null,
      historyById[item.id] ?? null,
    ];
    for (const body of bodies) {
      if (!body || !matchesSearchable(body, query)) continue;
      const snippet = snippetFor(body, query);
      if (snippet) snippets[item.id] = snippet;
      return true;
    }
    return false;
  });

  return { items: matched, hasQuery: true, snippets };
}

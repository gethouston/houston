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

/**
 * Filter `items` by `rawQuery` over titles, descriptions and any chat history
 * already scanned for them.
 *
 * `historyById` holds PRE-FOLDED transcripts (see {@link SearchableText}):
 * matching a keystroke against them is then a regex test, not a re-fold of
 * every mission's conversation (HOU-941). Description and history are matched
 * as separate bodies — a snippet comes from whichever one matched, so no
 * per-keystroke concatenation of transcript-sized strings is needed.
 */
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
    // A title match speaks for itself: keep it, show no snippet, and (per #411)
    // never highlight the title.
    if (matchesPhrase(item.title, query)) return true;
    // Otherwise search the body, then the loaded chat history (which includes
    // the user's own messages), and surface a snippet showing why it matched.
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

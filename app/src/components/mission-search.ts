import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import type { HighlightRange } from "@houston-ai/core";
import {
  extractSnippet,
  findHighlightRanges,
  foldForSearch,
  type MissionSnippet,
} from "./mission-highlight.ts";

export type MissionSearchMode = "none" | "title" | "text";

export interface MissionSearchResult<T> {
  items: T[];
  mode: MissionSearchMode;
  query: string;
  hasQuery: boolean;
  /** Folded search terms (lowercase, accents stripped). */
  terms: string[];
  /** `item.id` -> ranges within that item's title, present only when the title
   *  contains a term. Highlights the matched keyword in place. */
  titleRanges: Record<string, HighlightRange[]>;
  /** `item.id` -> matched body/history fragment, shown below the title when the
   *  match is NOT in the title. */
  snippets: Record<string, MissionSnippet>;
}

export function normalizeMissionSearchQuery(value: string): string {
  return foldForSearch(value).trim();
}

function queryTerms(query: string): string[] {
  return normalizeMissionSearchQuery(query).split(/\s+/).filter(Boolean);
}

function matchesTerms(value: string | undefined, terms: string[]): boolean {
  if (!value || terms.length === 0) return false;
  const folded = foldForSearch(value);
  return terms.every((term) => folded.includes(term));
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

function buildTitleRanges<T extends KanbanItem>(
  items: T[],
  terms: string[],
): Record<string, HighlightRange[]> {
  const titleRanges: Record<string, HighlightRange[]> = {};
  for (const item of items) {
    const ranges = findHighlightRanges(item.title, terms);
    if (ranges.length > 0) titleRanges[item.id] = ranges;
  }
  return titleRanges;
}

export function searchMissions<T extends KanbanItem>(
  items: T[],
  rawQuery: string,
  historyTextById: Record<string, string> = {},
): MissionSearchResult<T> {
  const query = normalizeMissionSearchQuery(rawQuery);
  const terms = queryTerms(rawQuery);
  if (terms.length === 0) {
    return {
      items,
      mode: "none",
      query,
      hasQuery: false,
      terms,
      titleRanges: {},
      snippets: {},
    };
  }

  const titleMatches = items.filter((item) => matchesTerms(item.title, terms));
  if (titleMatches.length > 0) {
    return {
      items: titleMatches,
      mode: "title",
      query,
      hasQuery: true,
      terms,
      titleRanges: buildTitleRanges(titleMatches, terms),
      snippets: {},
    };
  }

  // No title matched the full query — fall back to body + loaded chat history,
  // and build a snippet around the first match so the user sees WHY it matched.
  // Per #411 this is the "match is NOT in the title" case, so we show only the
  // snippet and leave the title un-highlighted (titleRanges stays empty).
  const textMatches: T[] = [];
  const snippets: Record<string, MissionSnippet> = {};
  for (const item of items) {
    const text = [item.description, historyTextById[item.id]]
      .filter(Boolean)
      .join("\n");
    if (!matchesTerms(text, terms)) continue;
    textMatches.push(item);
    const snippet = extractSnippet(text, terms);
    if (snippet) snippets[item.id] = snippet;
  }

  return {
    items: textMatches,
    mode: "text",
    query,
    hasQuery: true,
    terms,
    titleRanges: {},
    snippets,
  };
}

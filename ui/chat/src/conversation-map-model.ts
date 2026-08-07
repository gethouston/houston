import type { HighlightRange } from "@houston-ai/core";
import type { ChatDisplayItem } from "./chat-process-groups";
import {
  conversationSearchRanges,
  conversationSearchSnippet,
  matchesConversationSearch,
  normalizeConversationSearchQuery,
} from "./conversation-map-search.ts";
import type { ChatMessage } from "./feed-to-messages";
import { messagePreviewText } from "./message-preview.ts";

export type ConversationMomentType =
  | "user"
  | "assistant"
  | "artifact"
  | "error";

export interface ConversationMoment {
  id: string;
  messageKey: string;
  type: ConversationMomentType;
  preview: string;
  searchText: string;
  position: number;
}

const MAX_MOMENTS = 24;
const PREVIEW_LENGTH = 96;

/** Search-filtered map entries and their display highlight ranges. */
export interface ConversationMomentSearchResult {
  moments: ConversationMoment[];
  hasQuery: boolean;
  rangesById: Record<string, HighlightRange[]>;
}

/** Derives searchable navigation moments from every message currently rendered. */
export function deriveConversationMoments(
  displayItems: ChatDisplayItem[],
): ConversationMoment[] {
  const moments = displayItems.flatMap((item) => {
    if (item.kind === "process") return [];
    const { message, sourceIndex } = item;
    const type = momentTypeFor(message);
    if (!type) return [];
    const searchText = searchTextFor(message.content);
    return [
      {
        id: message.key,
        messageKey: message.key,
        type,
        preview: previewFor(searchText),
        searchText,
        position: sourceIndex + 1,
      },
    ];
  });

  return moments;
}

/** Filter every loaded message before compacting the visible map. */
export function searchConversationMoments(
  moments: ConversationMoment[],
  rawQuery: string,
): ConversationMomentSearchResult {
  const query = normalizeConversationSearchQuery(rawQuery);
  const matched = query
    ? moments.flatMap((moment) => {
        if (!matchesConversationSearch(moment.searchText, query)) return [];
        return [
          {
            ...moment,
            preview:
              conversationSearchSnippet(moment.searchText, query) ??
              moment.preview,
          },
        ];
      })
    : moments.filter((moment) => moment.type === "user");
  const visible = capMoments(matched);
  const rangesById = query
    ? Object.fromEntries(
        visible.map((moment) => [
          moment.id,
          conversationSearchRanges(moment.preview, query),
        ]),
      )
    : {};
  return { moments: visible, hasQuery: query.length > 0, rangesById };
}

function momentTypeFor(message: ChatMessage): ConversationMomentType | null {
  if (message.runtimeError || message.providerError) return "error";
  if (message.from === "user" && message.content) return "user";
  if (message.from === "assistant" && message.fileChanges.length > 0)
    return "artifact";
  if (message.from === "assistant" && message.content) return "assistant";
  return null;
}

function searchTextFor(content: string): string {
  // Decode Skill / attachment / interaction-answers markers so the map never
  // leaks raw marker JSON; plain assistant/user text passes through unchanged.
  const decoded = messagePreviewText(content);
  return decoded.replace(/\s+/g, " ").trim();
}

function previewFor(searchText: string): string {
  if (searchText.length <= PREVIEW_LENGTH) return searchText;
  return `${searchText.slice(0, PREVIEW_LENGTH - 3)}...`;
}

function capMoments(moments: ConversationMoment[]): ConversationMoment[] {
  if (moments.length <= MAX_MOMENTS) return moments;

  const selected = new Map<number, ConversationMoment>();
  const important = moments.filter(
    (moment) => moment.type === "artifact" || moment.type === "error",
  );
  const first = moments[0];
  const last = moments.at(-1);
  if (!first || !last) return moments;

  selected.set(first.position, first);
  selected.set(last.position, last);
  for (const moment of important) {
    if (selected.size === MAX_MOMENTS) break;
    selected.set(moment.position, moment);
  }
  for (let slot = 0; slot < MAX_MOMENTS; slot += 1) {
    if (selected.size === MAX_MOMENTS) break;
    const index = Math.round((slot * (moments.length - 1)) / (MAX_MOMENTS - 1));
    selected.set(moments[index].position, moments[index]);
  }
  for (const moment of moments) {
    if (selected.size === MAX_MOMENTS) break;
    selected.set(moment.position, moment);
  }

  return [...selected.values()].sort((a, b) => a.position - b.position);
}

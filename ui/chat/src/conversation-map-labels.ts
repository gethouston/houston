import type { ConversationMomentType } from "./conversation-map-model";

export interface ConversationMapLabels {
  title?: string;
  moreActions?: string;
  find?: string;
  moveToDone?: string;
  delete?: string;
  hide?: string;
  searchPlaceholder?: string;
  clearSearch?: string;
  noResults?: string;
  backToLatest?: string;
  selected?: string;
  messagePosition?: (position: number) => string;
  types?: Partial<Record<ConversationMomentType, string>>;
}

export interface ResolvedConversationMapLabels {
  title: string;
  moreActions: string;
  find: string;
  moveToDone: string;
  delete: string;
  hide: string;
  searchPlaceholder: string;
  clearSearch: string;
  noResults: string;
  backToLatest: string;
  selected: string;
  messagePosition: (position: number) => string;
  types: Record<ConversationMomentType, string>;
}

export const DEFAULT_CONVERSATION_MAP_LABELS: ResolvedConversationMapLabels = {
  title: "Search chat",
  moreActions: "Chat actions",
  find: "Find",
  moveToDone: "Move to done",
  delete: "Delete",
  hide: "Close chat search",
  searchPlaceholder: "Search messages",
  clearSearch: "Clear search",
  noResults: "No messages match your search.",
  backToLatest: "Back to latest",
  selected: "Selected message",
  messagePosition: (position) => `Message ${position}`,
  types: {
    user: "You",
    assistant: "Agent response",
    artifact: "Files updated",
    error: "Something needs attention",
  },
};

export function resolveConversationMapLabels(
  labels?: ConversationMapLabels,
): ResolvedConversationMapLabels {
  return {
    ...DEFAULT_CONVERSATION_MAP_LABELS,
    ...labels,
    types: { ...DEFAULT_CONVERSATION_MAP_LABELS.types, ...labels?.types },
  };
}

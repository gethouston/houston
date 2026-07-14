import type { ConversationMomentType } from "./conversation-map-model";

export interface ConversationMapLabels {
  title?: string;
  view?: string;
  hide?: string;
  backToLatest?: string;
  empty?: string;
  selected?: string;
  messagePosition?: (position: number) => string;
  types?: Partial<Record<ConversationMomentType, string>>;
}

export interface ResolvedConversationMapLabels {
  title: string;
  view: string;
  hide: string;
  backToLatest: string;
  empty: string;
  selected: string;
  messagePosition: (position: number) => string;
  types: Record<ConversationMomentType, string>;
}

export const DEFAULT_CONVERSATION_MAP_LABELS: ResolvedConversationMapLabels = {
  title: "Conversation map",
  view: "View map",
  hide: "Hide map",
  backToLatest: "Back to latest",
  empty: "This conversation does not have enough moments to navigate yet.",
  selected: "Selected message",
  messagePosition: (position) => `Message ${position}`,
  types: {
    user: "You",
    assistant: "Agent response",
    artifact: "Files updated",
    error: "Something needs attention",
  },
};

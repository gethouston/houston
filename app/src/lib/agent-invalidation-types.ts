import type { QueryKey } from "@tanstack/react-query";

export interface InvalidationPlan {
  invalidate: QueryKey[];
  invalidateAll?: boolean;
  patchAllConversations: string[];
  reloadAgentsWorkspace?: string;
  focusWindow?: boolean;
}

export interface InvalidationContext {
  workspaceId?: string;
  customOAuthReturn?: boolean;
  isKnownAgent?: (agentPath: string) => boolean;
}

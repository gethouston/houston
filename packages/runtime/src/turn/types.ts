import type {
  ChatMessage,
  GrantableOperation,
  TurnLimits,
  TurnMode,
} from "@houston/protocol";
import type { PrefetchedObjects } from "@houston/runtime-client/object-sync";
import type { ServedCredential } from "../auth/auth-file";
import type { ClaudeSubscriptionType } from "../auth/claude-plan";
import type { MissionTitleRequest } from "../session/mission-title";

export type TurnGrantScope =
  | "integrations"
  | "agent-writes"
  | "code-run"
  | "browser-live";

export interface TurnGrant {
  url: string;
  token: string;
  expires: number;
  scopes: TurnGrantScope[];
}

export interface TurnCoordinator {
  token: string;
  expires: number;
}

export type TurnCredential = ServedCredential & {
  subscriptionType?: ClaudeSubscriptionType;
};

export interface TurnRequest {
  liveMode?: import("../session/turn-mode-context").TurnModeRef;
  workspaceId: string;
  agentId: string;
  conversationId: string;
  text: string;
  nonce?: string;
  gcsPrefix: string;
  credential: TurnCredential | null;
  provider?: string;
  model?: string;
  effort?: string;
  mode?: TurnMode;
  nextStepSuggestions?: boolean;
  timezone?: string;
  displayText?: string;
  mentions?: ChatMessage["mentions"];
  limits?: TurnLimits;
  missionTitle?: MissionTitleRequest;
  turnId?: string;
  hostToken?: string;
  actingToken?: string;
  actingAs?: { userId: string; name?: string };
  shadow?: boolean;
  workspaceContext?: string;
  userContext?: string;
  turnlogSeqStart?: number;
  routine?: {
    id: string;
    events?: { id: string; trigger_slug: string; payload: unknown }[];
  };
  claim?: {
    id: string;
    bootId: string;
    token: string;
    heartbeatUrl: string;
  };
  grant?: TurnGrant;
  coordinator?: TurnCoordinator;
  approvals?: unknown;
  grants?: GrantableOperation[];
  prefetch?: PrefetchedObjects;
}

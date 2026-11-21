export type InteractionOption =
  | InteractionChoiceOption
  | { kind: "approval"; id: "approve" | "decline" };

export interface InteractionChoiceOption {
  kind?: "choice";
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export type HandsOnSurface =
  | "apiKeys"
  | "billing"
  | "files"
  | "routineWebhook"
  | "orgDanger"
  | "agentApiAccess";

export type InteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      detail?: string;
      options?: InteractionOption[];
      toolkit?: string;
      wantsFiles?: boolean;
      requestId?: string;
    }
  | { kind: "signin"; id: string; reason?: string }
  | {
      kind: "connect";
      id: string;
      toolkit: string;
      reason?: string;
      reconnect?: boolean;
      refusedAt?: string;
    }
  | { kind: "credential"; id: string; toolkit: string; reason?: string }
  | { kind: "provider_connect"; id: string; provider: string; reason?: string }
  | {
      kind: "hands_on";
      id: string;
      surface: HandsOnSurface;
      agentId?: string;
      reason?: string;
    }
  | { kind: "plan_ready"; id: string; summary: string }
  | {
      kind: "suggest_reusable";
      id: string;
      reusableKind: "skill" | "routine" | "learning";
      title: string;
      rationale: string;
    }
  | {
      kind: "suggest_actions";
      id: string;
      actions: { id: string; label: string; message: string }[];
    };

export interface PendingInteraction {
  steps: InteractionStep[];
}

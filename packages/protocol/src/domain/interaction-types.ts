import type { ApprovalArg } from "./approval";

export const HANDS_ON_SURFACES = [
  "apiKeys",
  "billing",
  "files",
  "routineWebhook",
  "orgDanger",
  "agentApiAccess",
] as const;

export type HandsOnSurface = (typeof HANDS_ON_SURFACES)[number];

export const isHandsOnSurface = (v: unknown): v is HandsOnSurface =>
  HANDS_ON_SURFACES.includes(v as HandsOnSurface);

export type InteractionOption =
  | ChoiceOption
  | {
      kind: "approval";
      id: "approve" | "decline";
      label?: string;
    };

interface ChoiceOption {
  kind?: "choice";
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

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
      approval?: { operation: string; args: ApprovalArg[] };
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
  | { kind: "provider_connect"; id: string; provider: string; reason?: string }
  | { kind: "credential"; id: string; toolkit: string; reason?: string }
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

export type SuggestionStep = Extract<
  InteractionStep,
  { kind: "suggest_actions" | "suggest_reusable" }
>;

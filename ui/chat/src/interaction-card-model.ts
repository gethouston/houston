export interface ChatInteractionBrand {
  name: string;
  logoUrl?: string;
}

export interface ChatInteractionOption {
  kind?: "choice" | "approval";
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export type ChatInteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      detail?: string;
      hire?: {
        color?: string;
        role?: string;
        instructions?: string;
        instructionsLabel?: string;
      };
      options?: ChatInteractionOption[];
      hideFreeText?: boolean;
      wantsFiles?: boolean;
      brand?: ChatInteractionBrand;
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
  | { kind: "custom"; id: string; title: string };

export type ChatInteractionAnswerSource =
  | { source: "option"; optionId: string }
  | { source: "text" };

export type ChatInteractionAnswer = {
  stepId: string;
  question: string;
  answer: string;
} & ChatInteractionAnswerSource;

export function hasSelectableOptions(
  options?: ChatInteractionOption[],
): boolean {
  return Array.isArray(options) && options.length > 0;
}

export function normalizeAnswer(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function prettifyToolkit(toolkit: string): string {
  return toolkit
    .trim()
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function optionLabel(
  step: ChatInteractionStep,
  optionId: string,
): string | null {
  if (step.kind !== "question") return null;
  return step.options?.find((o) => o.id === optionId)?.label ?? null;
}

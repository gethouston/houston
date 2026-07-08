// Shared data types + stateless value helpers for ChatInteractionCard. DOM-free
// so the node:test suite can import them; the stepper state machine in
// interaction-card-logic.ts builds on these, and the .tsx component re-uses them.

export interface ChatInteractionOption {
  id: string;
  label: string;
}

/** How a proposed custom integration attaches its secret (mirrors the protocol
 *  `CustomIntegrationAuth`; ui/chat stays protocol-agnostic so it restates it). */
export type ChatCustomIntegrationAuth =
  | { type: "header"; header: string; prefix?: string }
  | { type: "query"; param: string };

/** How a proposed MCP server authenticates (mirrors the protocol
 *  `McpServerAuth`). */
export type ChatMcpServerAuth =
  | { type: "none" }
  | { type: "bearer" }
  | { type: "header"; header: string };

export type ChatInteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      options?: ChatInteractionOption[];
    }
  | { kind: "signin"; id: string; reason?: string }
  | { kind: "connect"; id: string; toolkit: string; reason?: string }
  | {
      kind: "custom_integration";
      id: string;
      proposal: {
        name: string;
        baseUrl: string;
        auth: ChatCustomIntegrationAuth;
        description: string;
      };
      reason?: string;
    }
  | {
      kind: "mcp_server";
      id: string;
      proposal: {
        name: string;
        url: string;
        auth: ChatMcpServerAuth;
        description?: string;
      };
      reason?: string;
    };

/** One completed question answer handed to `onComplete`, in step order. */
export interface ChatInteractionAnswer {
  stepId: string;
  question: string;
  answer: string;
}

/** Every step now shows exactly one question, so the head always reads as the
 *  single next action: sized up and weighted (matches the composer replace). */
export const QUESTION_TEXT_CLASS =
  "text-lg font-medium leading-snug text-foreground";

/** True when the agent offered concrete choices (option rows render). */
export function hasSelectableOptions(
  options?: ChatInteractionOption[],
): boolean {
  return Array.isArray(options) && options.length > 0;
}

/** Trim a typed free-text answer; whitespace-only answers are not sendable. */
export function normalizeAnswer(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The option label for a question step, or null when the id is unknown. */
export function optionLabel(
  step: ChatInteractionStep,
  optionId: string,
): string | null {
  if (step.kind !== "question") return null;
  return step.options?.find((o) => o.id === optionId)?.label ?? null;
}

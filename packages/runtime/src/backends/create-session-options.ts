import type { TurnMode } from "@houston/protocol";
import type { ProvidedContext } from "../session/workspace-context";
import type { ResolvedModel, ThinkingLevel } from "./types";

export interface CreateSessionOptions {
  conversationId: string;
  nextStepSuggestions?: boolean;
  timezone?: string;
  model: ResolvedModel;
  thinkingLevel?: ThinkingLevel;
  mode?: TurnMode;
  context?: ProvidedContext;
  fresh?: boolean;
  // WHY: Lazy: building history reads archived segments; a native resume must pay none of it. ADR-0010
  freshRetryPromptPrefix?: () => string;
  recordedContextTokens?: () => number | undefined;
}

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
  freshRetryPromptPrefix?: () => string;
  recordedContextTokens?: () => number | undefined;
}

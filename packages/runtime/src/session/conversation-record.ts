import type { TurnMode } from "@houston/protocol";
import type { HarnessSession } from "../backends/types";
import type { TurnModeRef } from "./turn-mode-context";
import type { ProvidedContext } from "./workspace-context";

export type Conversation = {
  session: HarnessSession;
  queue: Promise<unknown>;
  provider: string;
  model: string;
  backendId: string;
  mode: TurnMode;
  nextStepSuggestions?: boolean;
  timezone?: string;
  liveMode?: TurnModeRef;
  context?: ProvidedContext;
  turnId?: string;
  stoppedTurnId?: string;
  pending: number;
  sessionRebuildPending?: true;
};

export const isConvBusy = (conv: Conversation): boolean =>
  (conv.pending ?? 0) > 0 || conv.turnId !== undefined;

import type { TurnMode } from "@houston/protocol";
import type { HarnessSession } from "../backends/types";
import type { TurnModeRef } from "./turn-mode-context";
import type { ProvidedContext } from "./workspace-context";

export type Conversation = {
  session: HarnessSession;
  queue: Promise<unknown>;
  provider: string;
  model: string;
  // WHY: Never setModel a foreign model; pi would run an anthropic turn, Claude an openai id. ADR-0012
  backendId: string;
  mode: TurnMode;
  nextStepSuggestions?: boolean;
  timezone?: string;
  liveMode?: TurnModeRef;
  context?: ProvidedContext;
  turnId?: string;
  // WHY: pi resolves an aborted prompt clean with no error; this is the only stop trace. ADR-0012
  stoppedTurnId?: string;
  // WHY: turnId misses a turn parked behind the workdir lock; pending pins against eviction. ADR-0012
  pending: number;
  sessionRebuildPending?: true;
};

export const isConvBusy = (conv: Conversation): boolean =>
  (conv.pending ?? 0) > 0 || conv.turnId !== undefined;

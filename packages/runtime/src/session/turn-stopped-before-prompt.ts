import type { ModelCallReport } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import {
  appendAssistantMessage,
  stampSessionReplay,
} from "../store/conversations";
import { reportMissionSettle } from "./mission-settle";

export function settleStoppedBeforePrompt(
  id: string,
  turnId: string,
  setup: {
    replayedHistory: boolean;
    providerSwitch: ChatMessage["providerSwitch"];
    compaction: ChatMessage["compaction"];
    modelCalls: ModelCallReport | undefined;
  },
): void {
  if (setup.replayedHistory) stampSessionReplay(id);
  appendAssistantMessage(id, "", {
    providerSwitch: setup.providerSwitch,
    compaction: setup.compaction,
    stopped: true,
    turnId,
  });
  reportMissionSettle(id, "needs_you", null, turnId, true, setup.modelCalls);
}

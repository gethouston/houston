import type { IncomingMessage } from "node:http";
import type { MissionStarter } from "@houston/protocol";
import { isAssistantRequest } from "../auth/assistant-call";
import { assistantRuntimeRole } from "../launcher/assistant-role";

export function callerMissionStarter(agentId: string): MissionStarter {
  return assistantRuntimeRole({ agentId }) ? "houston" : "employee";
}

export function inboundMissionStarter(
  deps: { gatewayFronted?: boolean },
  req: IncomingMessage,
  callingAgent?: string,
): MissionStarter | undefined {
  if (callingAgent) return "employee";
  return isAssistantRequest(deps, req) ? "houston" : undefined;
}

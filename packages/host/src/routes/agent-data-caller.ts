import type { IncomingMessage } from "node:http";
import {
  type ActivityContributor,
  type MissionStarter,
  parseRoutineFloorHeader,
  ROUTINE_FLOOR_HEADER,
} from "@houston/protocol";
import {
  ACTING_AS_HEADER,
  ACTING_VIA_API,
  actingAuthorFor,
  actingViaFromHeader,
  routineActorFor,
} from "../auth/acting";
import { isAssistantRequest } from "../auth/assistant-call";
import type { UserId } from "../domain/types";

export interface AgentDataCaller {
  createdBy?: string;
  author?: ActivityContributor;
  triggersEnabled?: boolean;
  startedBy?: MissionStarter;
  routineFloorMinutes?: number;
}

export function trustedRoutineFloor(
  deps: { gatewayFronted?: boolean },
  req: IncomingMessage,
): number | undefined {
  return deps.gatewayFronted
    ? parseRoutineFloorHeader(req.headers[ROUTINE_FLOOR_HEADER])
    : undefined;
}

export function agentDataCaller(
  deps: {
    gatewayFronted?: boolean;
    ownerSub?: string;
    triggersEnabled?: boolean;
  },
  req: IncomingMessage,
  userId: UserId,
): AgentDataCaller {
  const createdBy = routineActorFor(deps, req, userId);
  const author = actingAuthorFor(deps, req);
  const routineFloorMinutes = trustedRoutineFloor(deps, req);
  const startedBy: MissionStarter | undefined = isAssistantRequest(deps, req)
    ? "houston"
    : deps.gatewayFronted &&
        actingViaFromHeader(req.headers[ACTING_AS_HEADER]) === ACTING_VIA_API
      ? "api"
      : undefined;
  return {
    ...(createdBy ? { createdBy } : {}),
    ...(author ? { author } : {}),
    triggersEnabled: deps.triggersEnabled ?? false,
    ...(startedBy ? { startedBy } : {}),
    ...(routineFloorMinutes ? { routineFloorMinutes } : {}),
  };
}

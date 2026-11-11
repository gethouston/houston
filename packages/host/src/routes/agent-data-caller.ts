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

/** What the typed `.houston` families stamp from WHO made the request. */
export interface AgentDataCaller {
  /**
   * The verified acting identity of THIS request (C2), recorded as a new
   * routine's `created_by` and re-stamped on PATCH, so a fired routine turn
   * acts as whoever last shaped it. Gateway-fronted pods pass the gateway-
   * minted acting sub (the id the gateway re-authorizes at fire time, HOU-689);
   * the desktop passes its local owner. Absent in callers that don't carry
   * identity; the field then stays as-is (absent on create).
   */
  createdBy?: string;
  /**
   * The verified acting human as a full contributor (C2): activities stamp
   * `created_by` + a contributor entry from it (routines take the sub-only
   * `createdBy` above). Absent off the gateway, keeping single-player
   * activity.json byte-identical.
   */
  author?: ActivityContributor;
  /**
   * Whether this deployment can fire event-driven routines (a trigger backend
   * exists, Houston Cloud only). When false, a routine write carrying a
   * `trigger` binding is rejected: it could never wake here (a schedule can).
   * Reads still list existing trigger routines; the gate applies to writes only.
   */
  triggersEnabled?: boolean;
  /** Verified AI Manager or public API caller, stamped on a new card. */
  startedBy?: MissionStarter;
  /**
   * The acting person's plan floor for a routine save (minutes between
   * fires), from the gateway-stamped `x-houston-routine-floor`. Read only
   * where a gateway fronts every request: off it the header is client input.
   */
  routineFloorMinutes?: number;
}

/**
 * The writer's plan floor the gateway stamped on this routine write
 * (`x-houston-routine-floor`), or undefined. Trusted only where a gateway
 * fronts every request: off it the header is client input.
 */
export function trustedRoutineFloor(
  deps: { gatewayFronted?: boolean },
  req: IncomingMessage,
): number | undefined {
  return deps.gatewayFronted
    ? parseRoutineFloorHeader(req.headers[ROUTINE_FLOOR_HEADER])
    : undefined;
}

/** The caller facts of one routed request, each read from what the host
 *  verified (`auth/acting.ts`, `auth/assistant-call.ts`), never from the body. */
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

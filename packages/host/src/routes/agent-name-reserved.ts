import type { ServerResponse } from "node:http";
import {
  RESERVED_AGENT_NAME_MESSAGE,
  takesReservedAgentName,
} from "@houston/domain";
import { NAME_RESERVED } from "@houston/protocol";
import { json } from "./http";

export function refuseReservedAgentName(
  deps: { gatewayFronted?: boolean },
  res: ServerResponse,
  name: string,
  currentName?: string,
): boolean {
  if (deps.gatewayFronted || !takesReservedAgentName(name, currentName))
    return false;
  json(res, 400, { error: RESERVED_AGENT_NAME_MESSAGE, code: NAME_RESERVED });
  return true;
}

import {
  RESERVED_AGENT_NAME_MESSAGE,
  takesReservedAgentName,
} from "@houston/domain/agent-name";
import { NAME_RESERVED, NAME_TAKEN } from "@houston/protocol";
import { json } from "./http";
import { listAgents } from "./state";

export const nameTaken = (name: string) =>
  json(
    {
      error: `an agent named "${name}" already exists in this workspace`,
      code: NAME_TAKEN,
    },
    409,
  );

export function reservedNameRefusal(
  name: string,
  opts: { migration?: unknown; renamingId?: string },
): Response | null {
  if (opts.migration === true) return null;
  const current =
    opts.renamingId === undefined
      ? undefined
      : listAgents().find((agent) => agent.id === opts.renamingId)?.name;
  if (opts.renamingId !== undefined && current === undefined) return null;
  if (!takesReservedAgentName(name, current)) return null;
  return json({ error: RESERVED_AGENT_NAME_MESSAGE, code: NAME_RESERVED }, 400);
}

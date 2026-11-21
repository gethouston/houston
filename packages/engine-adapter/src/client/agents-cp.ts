import type {
  Agent,
  CreateAgent,
  CreateAgentResult,
} from "@houston/wire-types";
import * as controlPlane from "../control-plane";
import type { AdapterContext } from "./context";
import { viaSdk } from "./sdk-error";

export async function createAgentViaCp(
  ctx: AdapterContext,
  req: CreateAgent,
): Promise<CreateAgentResult> {
  const wire = await viaSdk("/agents", () =>
    ctx.sdk.agents.writes.create({
      name: req.name,
      claudeMd: req.claudeMd,
      seeds: req.seeds,
      config: req.config,
      migration: req.migration,
    }),
  );
  ctx.noteAgentAdded(wire.id);
  return { agent: controlPlane.createdAgentToUi(wire, req.color) };
}

export async function renameAgentViaCp(
  ctx: AdapterContext,
  agentId: string,
  newName: string,
): Promise<Agent> {
  const wire = await viaSdk(controlPlane.agentPath(agentId), () =>
    ctx.sdk.agents.writes.rename(agentId, newName),
  );
  if (wire.id !== agentId) {
    ctx.noteAgentGone(agentId);
    ctx.noteAgentAdded(wire.id);
  }
  return controlPlane.renamedAgentToUi(agentId, wire);
}

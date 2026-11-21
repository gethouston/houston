import { invalidAgentNameMessage, validateAgentName } from "@houston/domain";
import { routineActorFor } from "../auth/acting";
import type { Agent } from "../domain/types";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentColorOrNull, storeAgentColor } from "./agent-color";
import { refuseReservedAgentName } from "./agent-name-reserved";
import { answerAgentNameTaken } from "./agent-name-taken";
import { asSeedRecord } from "./agent-seed";
import { seedAgentTree } from "./agent-seed-tree";
import { agentPayload } from "./agents-payload";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

const HERE = "packages/host/src/routes/agents-crud.ts";

defineRoute({
  group: "agents",
  method: "GET",
  path: "/agents",
  phase: "user",
  classification: "sdk",
  source: HERE,
  async handler({ deps, userId, res }) {
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    const agents = await deps.store.listAgents(ws.id);
    json(
      res,
      200,
      await Promise.all(agents.map((a) => agentPayload(deps, ws, a))),
    );
  },
});

defineRoute({
  group: "agents",
  method: "POST",
  path: "/agents",
  phase: "user",
  classification: "sdk",
  source: HERE,
  async handler({ deps, userId, req, res }) {
    const body = await readJson(req);
    const { name } = body;
    if (!name || typeof name !== "string")
      return json(res, 400, { error: "missing 'name'" });
    const nameCheck = validateAgentName(name);
    if (!nameCheck.ok)
      return json(res, 400, {
        error: invalidAgentNameMessage(nameCheck.reason),
      });
    if (
      body.migration !== true &&
      refuseReservedAgentName(deps, res, nameCheck.name)
    )
      return;
    const claudeMd =
      typeof body.claudeMd === "string" ? body.claudeMd : undefined;
    let seeds: Record<string, string> | undefined;
    if (body.seeds !== undefined) {
      const parsed = asSeedRecord(body.seeds);
      if (!parsed)
        return json(res, 400, {
          error: "'seeds' must be a map of string→string",
        });
      seeds = parsed;
    }
    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    let agent: Agent;
    try {
      agent = await deps.store.createAgent({
        workspaceId: ws.id,
        name: nameCheck.name,
      });
    } catch (err) {
      if (answerAgentNameTaken(res, err)) return;
      throw err;
    }
    if (deps.vfs) {
      await seedAgentTree(
        { store: deps.store, vfs: deps.vfs },
        agent,
        (deps.paths ?? DEFAULT_PATHS).agentRoot(ws, agent),
        { claudeMd, seeds },
        routineActorFor(deps, req, userId),
      );
    }
    const createColor = agentColorOrNull(body.color);
    if (createColor && deps.vfs)
      await storeAgentColor(deps.vfs, ws.id, agent.id, createColor);
    deps.events?.emit(ws.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: ws.id,
    });
    json(res, 201, await agentPayload(deps, ws, agent));
  },
});

import {
  invalidAgentNameMessage,
  seedSchemas,
  validateAgentName,
} from "@houston/domain";
import { routineActorFor } from "../auth/acting";
import { DEFAULT_PATHS } from "./agent-authz";
import { agentColorOrNull, storeAgentColor } from "./agent-color";
import { asSeedRecord, writeAgentSeeds } from "./agent-seed";
import { agentPayload } from "./agents-payload";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

/**
 * The user's own agents: list and create. Their personal workspace is
 * auto-provisioned on the first hit, so a fresh account lists before it has
 * ever written anything.
 */
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
    // Surfaces validate before submitting (HOU-1166); this is the wire-level
    // backstop, answering a clean 400 instead of a store-level 500.
    const nameCheck = validateAgentName(name);
    if (!nameCheck.ok)
      return json(res, 400, {
        error: invalidAgentNameMessage(nameCheck.reason),
      });
    // Optional create-time content: CLAUDE.md instructions + a flat seed-file
    // map (skills, seeded .houston data, working files). Builtin templates and
    // portable installs supply these; the Rust engine wrote them on install, so
    // the host must too or the agent is created empty. Both are untrusted input
    // — validate before writing.
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
    const agent = await deps.store.createAgent({
      workspaceId: ws.id,
      name: nameCheck.name,
    });
    // Seed the .houston JSON schemas beside the (future) docs so the agent and
    // external tools can validate what they write. Skipped only when no vfs is
    // wired (legacy gke-only deploys); the typed-data routes 503 there anyway.
    if (deps.vfs) {
      const root = (deps.paths ?? DEFAULT_PATHS).agentRoot(ws, agent);
      try {
        await seedSchemas(deps.vfs, root);
        // Seeded routines bypass createRoutine, so stamp the creating user as
        // their `created_by` (same actor policy as the routine write routes):
        // the gateway-minted acting sub on a managed pod (org owner when the
        // header is absent), the local user on the desktop. Without it a
        // template/portable install births authorless routines the
        // control-plane planner refuses to fire.
        await writeAgentSeeds(
          deps.vfs,
          root,
          { claudeMd, seeds },
          routineActorFor(deps, req, userId),
        );
      } catch (err) {
        // Atomic-enough create: a seed-write failure must not leave a
        // permanently seedless agent. First-run reuses an existing record on
        // retry (ensureWorkspaceWithAssistant lists then reuses), so a
        // half-provisioned agent would never get re-seeded. Roll the just-created
        // record + its folder back so a retry recreates cleanly, then rethrow so
        // the failure still reaches the client (beta policy: no silent,
        // half-provisioned agents).
        try {
          await deps.vfs.deletePrefix(root);
          await deps.store.deleteAgent(agent.id);
        } catch (rollbackErr) {
          // Rollback itself failed — surface the ORIGINAL cause below, but leave
          // a breadcrumb for the orphaned record/folder.
          console.error(
            `[agents] seed rollback failed for ${agent.id}:`,
            rollbackErr instanceof Error ? rollbackErr.message : rollbackErr,
          );
        }
        throw err;
      }
    }
    // Optional create-time color, into the SAME `agent_colors` preference the
    // app's color sync reads (routes/agent-color.ts) — a template, a portable
    // install or the assistant can birth an agent already colored. Cosmetic, so
    // an absent or malformed value is simply not stored rather than failing the
    // create; a real write failure still propagates.
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

import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { installCommunitySkill } from "../skills/install";
import { DEFAULT_PATHS } from "./agent-authz";
import { json, readJson } from "./http";
import { failSkill } from "./skills-directory";
import type { SandboxSkillsDeps } from "./skills-sandbox";

/**
 * The INSTALL half of `/sandbox/skills/*` — the agent's `install_skill` tool.
 * Search lives in skills-sandbox-search.ts; the route + auth in
 * skills-sandbox.ts.
 */

/**
 * Install one searched skill into the CALLING agent's own `.agents/skills/`
 * tree — the same composition (frontmatter preserved, slug owns the directory,
 * idempotent re-install) the Skills UI's install route uses, because it is
 * literally the same function.
 */
export async function installAction(
  deps: SandboxSkillsDeps,
  claim: { workspaceId: string; agentId: string },
  req: IncomingMessage,
  res: ServerResponse,
  fetchImpl: typeof fetch,
): Promise<void> {
  const vfs = deps.vfs;
  if (!vfs) {
    // Same stable code the other sandbox proxies use, so the tool renders the
    // honest "not available in this install" speech act.
    json(res, 503, {
      error: "agent data not configured",
      code: "agent_data_not_configured",
    });
    return;
  }
  const ws = await deps.store.getWorkspace(claim.workspaceId);
  const agent = await deps.store.getAgent(claim.agentId);
  if (!ws || !agent) {
    json(res, 404, { error: "agent not found" });
    return;
  }

  const body = await readJson(req);
  if (typeof body.source !== "string" || typeof body.skillId !== "string") {
    json(res, 400, { error: "missing 'source' or 'skillId'" });
    return;
  }

  const paths = deps.paths ?? DEFAULT_PATHS;
  const root = paths.agentRoot(ws, agent);
  try {
    const slug = await installCommunitySkill(
      fetchImpl,
      vfs,
      root,
      body.source,
      body.skillId,
    );
    // React on the SAME channel the UI's install does, so the Skills tab shows
    // the new skill without a refresh (the AI-native reactivity rule).
    const event: HoustonEvent = { type: "SkillsChanged", agentPath: agent.id };
    deps.events?.emit(ws.ownerUserId, event);
    json(res, 201, { slug, path: `.agents/skills/${slug}/SKILL.md` });
  } catch (err) {
    failSkill(res, err);
  }
}

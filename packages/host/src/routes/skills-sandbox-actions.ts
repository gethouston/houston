import type { IncomingMessage, ServerResponse } from "node:http";
import type { HoustonEvent } from "@houston/protocol";
import { installCommunitySkill } from "../skills/install";
import { DEFAULT_PATHS } from "./agent-authz";
import { json, readJson } from "./http";
import {
  communityDirectory,
  failSkill,
  previewDirectory,
} from "./skills-directory";
import type { SandboxSkillsDeps } from "./skills-sandbox";

/**
 * The two actions behind `/sandbox/skills/*` (see skills-sandbox.ts for the
 * route, its auth, and WHY this exists natively rather than as an installed
 * copy of Vercel's CLI-driven `find-skills` skill).
 */

/** How many search hits get enriched with their real description. Each is a
 *  cached GitHub SKILL.md lookup, so this is the latency/quality knob: without
 *  a description the agent can only judge a skill by its slug. */
const ENRICH_LIMIT = 5;

/** What the agent gets back per hit — the search row plus the description the
 *  recommendation actually rests on. */
interface FoundSkill {
  skillId: string;
  source: string;
  name: string;
  installs: number;
  description?: string;
}

/**
 * Search skills.sh, then enrich the top hits with their real descriptions.
 *
 * Enrichment is best-effort per skill: a SKILL.md that can't be located (moved,
 * renamed, private) still returns as a hit without a description rather than
 * failing the whole search — the agent can then judge it on name and installs,
 * which is exactly what it would have had anyway.
 */
export async function searchAction(
  deps: SandboxSkillsDeps,
  req: IncomingMessage,
  res: ServerResponse,
  fetchImpl: typeof fetch,
): Promise<void> {
  const body = await readJson(req);
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    json(res, 400, { error: "missing 'query'" });
    return;
  }
  try {
    const hits = await (deps.directory ?? communityDirectory).search(query);
    const enriched = await Promise.all(
      hits.slice(0, ENRICH_LIMIT).map(async (hit): Promise<FoundSkill> => {
        const base: FoundSkill = {
          skillId: hit.skillId,
          source: hit.source,
          name: hit.name,
          installs: hit.installs,
        };
        try {
          const preview = await (deps.previews ?? previewDirectory).preview(
            fetchImpl,
            hit.source,
            hit.skillId,
          );
          return preview.description
            ? { ...base, description: preview.description }
            : base;
        } catch {
          // Best-effort by design (see above): one unreachable SKILL.md must
          // not cost the user the whole answer.
          return base;
        }
      }),
    );
    json(res, 200, { skills: enriched });
  } catch (err) {
    failSkill(res, err);
  }
}

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

import type { IncomingMessage, ServerResponse } from "node:http";
import { json, readJson } from "./http";
import {
  communityDirectory,
  failSkill,
  previewDirectory,
} from "./skills-directory";
import type { SandboxSkillsDeps } from "./skills-sandbox";
import { searchCommunitySkills } from "./skills-search";

/**
 * The SEARCH half of `/sandbox/skills/*` — the agent's `find_skills` tool (see
 * skills-sandbox.ts for the route, its auth, and WHY this exists natively
 * rather than as an installed copy of Vercel's CLI-driven `find-skills` skill).
 * The install half lives in skills-sandbox-actions.ts.
 */

/**
 * How many of the ranked hits get enriched with their real description. Each
 * enrichment is a cached GitHub SKILL.md lookup, so this bounds latency — it
 * does NOT bound how many candidates the agent sees.
 *
 * That distinction is load-bearing. An agent handed only the enrichable head
 * would confidently report "there's nothing for that" about a tail it was never
 * shown — `mattpocock/skills` sits at rank 6+ on plenty of queries with 300k+
 * installs each. Visibility is bounded by {@link RESULT_LIMIT} alone; every hit
 * inside it ships, described or not.
 */
/** At most this many queries per call; each is one spaced skills.sh request. */
const MAX_QUERIES = 3;

/**
 * Run every query, merge the results, and return them ranked, with the top
 * {@link ENRICH_LIMIT} carrying their real descriptions.
 *
 * WHY several queries instead of one. A skill is findable by the words in its
 * OWN title, not the words the user happened to say: `mattpocock/skills`'
 * `writing-great-skills` (312k installs) is rank 2 for "writing skills" and
 * absent from all 100 hits for "create and improve skills" — the same request,
 * phrased the way a user would. One model-invented phrase is a coin flip, so the
 * tool asks for up to three and the union is what gets judged. (Query LANGUAGE
 * is the other half of that failure and is fixed in the tool's parameter
 * description: the catalog is English-only, and a Spanish query returns
 * unrelated rows even when a perfect skill exists.)
 *
 * Enrichment is best-effort per skill: a SKILL.md that can't be located (moved,
 * renamed, private) still returns as a hit without a description rather than
 * failing the whole search — the agent can then judge it on name and installs,
 * which is exactly what it would have had anyway. Un-enriched tail hits are
 * returned the same way, so ranking, not fetch budget, decides what the agent
 * can consider.
 */
export async function searchAction(
  deps: SandboxSkillsDeps,
  req: IncomingMessage,
  res: ServerResponse,
  fetchImpl: typeof fetch,
): Promise<void> {
  const body = await readJson(req);
  const queries = Array.isArray(body.queries)
    ? body.queries
        .filter((q: unknown): q is string => typeof q === "string")
        .map((q: string) => q.trim())
        .filter((query: string) => query.length > 0)
        .slice(0, MAX_QUERIES)
    : [];
  if (!queries.length) {
    json(res, 400, { error: "missing 'queries'" });
    return;
  }
  try {
    const result = await searchCommunitySkills(
      {
        directory: deps.directory ?? communityDirectory,
        previews: deps.previews ?? previewDirectory,
        fetchImpl,
      },
      queries,
    );
    json(res, 200, result);
  } catch (err) {
    failSkill(res, err);
  }
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { CommunitySkill } from "@houston/protocol";
import type { CommunityDirectory } from "../skills/community";
import { json, readJson } from "./http";
import {
  communityDirectory,
  failSkill,
  previewDirectory,
} from "./skills-directory";
import type { SandboxSkillsDeps } from "./skills-sandbox";

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
const ENRICH_LIMIT = 10;

/**
 * How many merged hits come back. skills.sh answers EVERY search with 100 rows
 * whether or not any of them are relevant (a nonsense query still returns 100),
 * so the deep tail is noise by construction and merging three queries could
 * otherwise put 300 rows in the model's context. This keeps the union of all
 * queries well past the head — the rank-6 misses that motivated the cap fix —
 * without spending thousands of tokens on rows nobody would ever pick.
 */
const RESULT_LIMIT = 60;

/** At most this many queries per call; each is one spaced skills.sh request. */
const MAX_QUERIES = 3;

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
 * Run each query and fold the result lists into one ranked list.
 *
 * A skill keeps its BEST position across the queries, so a rank-1 hit for the
 * phrasing that happened to match stays rank 1 in the merge instead of being
 * diluted by the queries that missed it — that is the entire point of asking
 * for several phrasings. Ties (the common case, since every query has its own
 * rank 1) break toward install count, which is the one quality signal the search
 * rows carry. Queries run concurrently; `CommunityDirectory` serializes the
 * actual outbound requests through its own global spacing, so this cannot
 * burst past the rate limit.
 */
async function mergeSearches(
  directory: Pick<CommunityDirectory, "search">,
  queries: string[],
): Promise<CommunitySkill[]> {
  const lists = await Promise.all(queries.map((q) => directory.search(q)));
  const best = new Map<string, { hit: CommunitySkill; rank: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const key = `${hit.source}#${hit.skillId}`;
      const seen = best.get(key);
      if (!seen || rank < seen.rank) best.set(key, { hit, rank });
    });
  }
  return [...best.values()]
    .sort((a, b) => a.rank - b.rank || b.hit.installs - a.hit.installs)
    .slice(0, RESULT_LIMIT)
    .map((e) => e.hit);
}

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
        .filter(Boolean)
        .slice(0, MAX_QUERIES)
    : [];
  if (!queries.length) {
    json(res, 400, { error: "missing 'queries'" });
    return;
  }
  try {
    const hits = await mergeSearches(
      deps.directory ?? communityDirectory,
      queries,
    );
    const enriched = await Promise.all(
      hits.map(async (hit, rank): Promise<FoundSkill> => {
        const base: FoundSkill = {
          skillId: hit.skillId,
          source: hit.source,
          name: hit.name,
          installs: hit.installs,
        };
        // Past the enrichment budget the hit still ships — ranked, named, and
        // installable — just without a fetched description.
        if (rank >= ENRICH_LIMIT) return base;
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

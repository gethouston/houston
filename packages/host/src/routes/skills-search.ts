import type { CommunitySkill } from "@houston/protocol";
import type { CommunityDirectory } from "../skills/community";
import type { PreviewDirectory } from "../skills/preview";

const ENRICH_LIMIT = 10;
const RESULT_LIMIT = 60;

/** Directory result enriched with the fields exposed to the agent. */
export interface FoundSkill {
  skillId: string;
  source: string;
  name: string;
  installs: number;
  description?: string;
}

/** External seams used by community skill search and preview enrichment. */
export interface SkillsSearchDeps {
  directory: Pick<CommunityDirectory, "search">;
  previews: Pick<PreviewDirectory, "preview">;
  fetchImpl: typeof fetch;
  signal?: AbortSignal | null;
}

async function mergeSearches(
  directory: SkillsSearchDeps["directory"],
  queries: string[],
  opts: Pick<SkillsSearchDeps, "fetchImpl" | "signal">,
): Promise<CommunitySkill[]> {
  const lists = await Promise.all(
    queries.map((query) => directory.search(query, opts)),
  );
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
    .map(({ hit }) => hit);
}

/** Merge multiple catalog searches by best rank and enrich their leading hits. */
export async function searchCommunitySkills(
  deps: SkillsSearchDeps,
  queries: string[],
): Promise<{ skills: FoundSkill[] }> {
  const hits = await mergeSearches(deps.directory, queries, deps);
  const skills = await Promise.all(
    hits.map(async (hit, rank): Promise<FoundSkill> => {
      const base: FoundSkill = {
        skillId: hit.skillId,
        source: hit.source,
        name: hit.name,
        installs: hit.installs,
      };
      if (rank >= ENRICH_LIMIT) return base;
      try {
        const preview = await deps.previews.preview(
          deps.fetchImpl,
          hit.source,
          hit.skillId,
        );
        return preview.description
          ? { ...base, description: preview.description }
          : base;
      } catch {
        // Preview enrichment is optional; the ranked result remains useful.
        return base;
      }
    }),
  );
  return { skills };
}

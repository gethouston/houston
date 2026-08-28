import type { CommunitySkill } from "@houston/protocol";
import { expect, test } from "vitest";
import { searchCommunitySkills } from "./skills-search";

const hit = (skillId: string, installs: number): CommunitySkill => ({
  id: `source/repo/${skillId}`,
  skillId,
  source: "source/repo",
  name: skillId,
  installs,
});

test("searchCommunitySkills keeps each skill's best rank and enriches results", async () => {
  const byQuery: Record<string, CommunitySkill[]> = {
    broad: [hit("filler", 10), hit("winner", 500)],
    exact: [hit("winner", 500), hit("other", 20)],
  };
  const result = await searchCommunitySkills(
    {
      directory: { search: async (query) => byQuery[query] ?? [] },
      previews: {
        preview: async (_fetch, _source, skillId) => ({
          title: null,
          description: `Description for ${skillId}`,
          image: null,
          category: null,
          tags: [],
          integrations: [],
          content: null,
        }),
      },
      fetchImpl: fetch,
    },
    ["broad", "exact"],
  );

  expect(result.skills.map((skill) => skill.skillId)).toEqual([
    "winner",
    "filler",
    "other",
  ]);
  expect(result.skills[0]?.description).toBe("Description for winner");
});

test("searchCommunitySkills keeps a hit when its preview fails", async () => {
  const result = await searchCommunitySkills(
    {
      directory: { search: async () => [hit("still-visible", 1)] },
      previews: {
        preview: async () => {
          throw new Error("gone");
        },
      },
      fetchImpl: fetch,
    },
    ["query"],
  );
  expect(result.skills).toEqual([
    {
      skillId: "still-visible",
      source: "source/repo",
      name: "still-visible",
      installs: 1,
    },
  ]);
});

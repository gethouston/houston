import { expect, test } from "vitest";
import { locateSkillMd } from "./github-lookup";
import { SkillRemoteError } from "./remote-error";

type Route = (url: string) => Response | null;
const fakeFetch =
  (...routes: Route[]): typeof fetch =>
  async (input) => {
    const url = String(input);
    for (const route of routes) {
      const res = route(url);
      if (res) return res;
    }
    return new Response("not found", { status: 404 });
  };

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const rawAt =
  (path: string, body: string): Route =>
  (url) =>
    url.includes(`raw.githubusercontent.com/owner/repo/HEAD/${path}`)
      ? new Response(body)
      : null;

test("locateSkillMd finds a common-path SKILL.md without hitting the tree API", async () => {
  let treeCalls = 0;
  const md = await locateSkillMd(
    fakeFetch(
      (url) => {
        if (url.includes("git/trees/HEAD")) treeCalls++;
        return null;
      },
      rawAt("skills/writing/SKILL.md", "hit"),
    ),
    "owner/repo",
    "writing",
  );
  expect(md).toBe("hit");
  expect(treeCalls).toBe(0);
});

test("locateSkillMd falls back to the tree scan for a nested path", async () => {
  const md = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD")
          ? jsonRes({
              tree: [
                { path: "README.md", type: "blob" },
                { path: "tools/deep-research/SKILL.md", type: "blob" },
              ],
            })
          : null,
      rawAt("tools/deep-research/SKILL.md", "nested-body"),
    ),
    "owner/repo",
    "deep-research",
  );
  expect(md).toBe("nested-body");
});

test("locateSkillMd matches by frontmatter name when the directory differs", async () => {
  const FM = "---\nname: research\n---\n\n# Research";
  const md = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD")
          ? jsonRes({
              tree: [{ path: "guides/research-notes/SKILL.md", type: "blob" }],
            })
          : null,
      rawAt("guides/research-notes/SKILL.md", FM),
    ),
    "owner/repo",
    "research",
  );
  expect(md).toBe(FM);
});

test("locateSkillMd throws skill_not_in_repo when nothing matches", async () => {
  const err = await locateSkillMd(
    fakeFetch(() => new Response("", { status: 404 })),
    "owner/repo",
    "ghost",
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
});

test("locateSkillMd prefers the earlier candidate path when more than one exists", async () => {
  // Both `skills/<id>/SKILL.md` and the bare `SKILL.md` resolve; the first
  // candidate in priority order must win even though fetches run concurrently.
  const md = await locateSkillMd(
    fakeFetch(
      rawAt("skills/writing/SKILL.md", "specific"),
      rawAt("SKILL.md", "root-fallback"),
    ),
    "owner/repo",
    "writing",
  );
  expect(md).toBe("specific");
});

test("locateSkillMd resolves a fuzzy skills/ dir via the shallow scan without a recursive call", async () => {
  // The real #1 skill: source vercel/ai, skillId ai-sdk, but the SKILL.md lives
  // at skills/use-ai-sdk/ with frontmatter `name: ai-sdk`. The path guesses all
  // 404; the shallow scan lists `skills/*`, fuzzy-matches both `use-ai-sdk` and
  // `migrate-ai-sdk-v6-to-v7` to `ai-sdk`, and confirms via frontmatter.
  let recursiveCalls = 0;
  const AI_SDK = "---\nname: ai-sdk\n---\n\n# AI SDK";
  const MIGRATE = "---\nname: migrate-ai-sdk-v6-to-v7\n---\n\n# Migrate";
  const md = await locateSkillMd(
    fakeFetch(
      (url) => {
        if (url.includes("recursive=1")) recursiveCalls++;
        return null;
      },
      (url) =>
        url.endsWith("git/trees/HEAD")
          ? jsonRes({
              tree: [
                { path: "src", type: "tree", sha: "src1" },
                { path: "skills", type: "tree", sha: "skills1" },
              ],
            })
          : null,
      (url) =>
        url.endsWith("git/trees/skills1")
          ? jsonRes({
              tree: [
                { path: "use-ai-sdk", type: "tree", sha: "u1" },
                { path: "migrate-ai-sdk-v6-to-v7", type: "tree", sha: "m1" },
              ],
            })
          : null,
      rawAt("skills/use-ai-sdk/SKILL.md", AI_SDK),
      rawAt("skills/migrate-ai-sdk-v6-to-v7/SKILL.md", MIGRATE),
    ),
    "owner/repo",
    "ai-sdk",
  );
  expect(md).toBe(AI_SDK);
  expect(recursiveCalls).toBe(0);
});

test("locateSkillMd shallow scan caps fuzzy candidate fetches at six", async () => {
  let candidateFetches = 0;
  const dirs = Array.from({ length: 10 }, (_, i) => ({
    path: `ai-sdk-${i}`,
    type: "tree",
    sha: `s${i}`,
  }));
  const err = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.endsWith("git/trees/HEAD")
          ? jsonRes({
              tree: [{ path: "skills", type: "tree", sha: "skills1" }],
            })
          : null,
      (url) =>
        url.endsWith("git/trees/skills1") ? jsonRes({ tree: dirs }) : null,
      (url) => {
        // Only the shallow nested candidates carry the `ai-sdk-<n>` segment.
        if (
          url.includes("raw.githubusercontent.com") &&
          url.includes("ai-sdk-")
        )
          candidateFetches++;
        return url.includes("raw.githubusercontent.com")
          ? new Response("", { status: 404 })
          : null;
      },
    ),
    "owner/repo",
    "ai-sdk",
    { deepScan: false },
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(candidateFetches).toBe(6);
});

test("locateSkillMd with deepScan: false skips the RECURSIVE scan on a shallow miss", async () => {
  let recursiveCalls = 0;
  const err = await locateSkillMd(
    fakeFetch((url) => {
      if (url.includes("recursive=1")) {
        recursiveCalls++;
        // Would resolve if the recursive scan ran — proves it is skipped.
        return jsonRes({
          tree: [{ path: "tools/writing/SKILL.md", type: "blob" }],
        });
      }
      if (url.includes("git/trees/HEAD"))
        // Shallow (non-recursive) sees no matching dir → shallow miss.
        return jsonRes({ tree: [{ path: "docs", type: "tree", sha: "d1" }] });
      return null;
    }),
    "owner/repo",
    "writing",
    { deepScan: false },
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(recursiveCalls).toBe(0);
});

test("locateSkillMd with deepScan: false still succeeds on a common-path hit", async () => {
  const md = await locateSkillMd(
    fakeFetch(rawAt("skills/writing/SKILL.md", "hit")),
    "owner/repo",
    "writing",
    { deepScan: false },
  );
  expect(md).toBe("hit");
});

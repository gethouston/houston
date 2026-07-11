import { expect, test } from "vitest";
import { MemoryVfs } from "../vfs";
import { CommunityDirectory } from "./community";
import { fetchSkillMdAtPath, listSkillsFromRepo } from "./github";
import {
  normalizeSource,
  parseRemoteSkillMd,
  skillIdFromPath,
  slugifyInstallId,
} from "./github-parse";
import { installCommunitySkill, installSkillsFromRepo } from "./install";
import { SkillRemoteError } from "./remote-error";

// ── normalizeSource (ported from the Rust oracle, HOU-440) ─────────

test("normalizeSource accepts urls, ssh, and pasted commands", () => {
  expect(normalizeSource("owner/repo")).toBe("owner/repo");
  expect(normalizeSource("https://github.com/owner/repo")).toBe("owner/repo");
  expect(normalizeSource("https://github.com/owner/repo/tree/main")).toBe(
    "owner/repo",
  );
  expect(normalizeSource("https://github.com/owner/repo.git")).toBe(
    "owner/repo",
  );
  expect(normalizeSource("https://github.com/owner/repo?tab=readme")).toBe(
    "owner/repo",
  );
  expect(normalizeSource("git@github.com:owner/repo.git")).toBe("owner/repo");
  expect(normalizeSource("  owner/repo  ")).toBe("owner/repo");
  expect(normalizeSource('"owner/repo"')).toBe("owner/repo");
  expect(
    normalizeSource(
      "npx skills add https://github.com/shadcn/improve --skill improve",
    ),
  ).toBe("shadcn/improve");
});

test("normalizeSource rejects unparseable input", () => {
  expect(normalizeSource("reconciliation")).toBeNull();
  expect(normalizeSource("please install my skills for me")).toBeNull();
  expect(normalizeSource("")).toBeNull();
  expect(normalizeSource("npx skills add reconciliation")).toBeNull();
  expect(normalizeSource("@owner/repo!")).toBeNull();
  expect(normalizeSource("my_org/repo")).toBeNull();
});

test("slug + path helpers", () => {
  expect(slugifyInstallId("refero_skill")).toBe("refero-skill");
  expect(slugifyInstallId("My-Repo")).toBe("my-repo");
  expect(slugifyInstallId("___")).toBe("skill");
  expect(slugifyInstallId("a".repeat(120)).length).toBe(64);
  expect(skillIdFromPath("SKILL.md", "my-repo")).toBe("my-repo");
  expect(skillIdFromPath("tools/code-review/SKILL.md", "r")).toBe(
    "code-review",
  );
});

test("parseRemoteSkillMd pulls title + frontmatter description", () => {
  const parsed = parseRemoteSkillMd(
    "---\nname: my-skill\ndescription: A test skill\n---\n\n# My Awesome Skill\n\nBody.",
    "my-skill",
  );
  expect(parsed.name).toBe("My Awesome Skill");
  expect(parsed.description).toBe("A test skill");
  const bare = parseRemoteSkillMd("no heading here", "no-title-skill");
  expect(bare.name).toBe("No Title Skill");
});

// ── fetch fakes ────────────────────────────────────────────────────

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

const SKILL_HIT = {
  id: "owner/repo/writing",
  skillId: "writing",
  name: "writing",
  installs: 7,
  source: "owner/repo",
};

// ── CommunityDirectory ─────────────────────────────────────────────

function fakeClock() {
  const state = { t: 0 };
  return {
    state,
    now: () => state.t,
    sleep: async (ms: number) => {
      state.t += ms;
    },
  };
}

test("community search caches fresh results and normalizes the key", async () => {
  let calls = 0;
  const clock = fakeClock();
  const dir = new CommunityDirectory({
    endpoint: "https://x/api/search",
    now: clock.now,
    sleep: clock.sleep,
    fetchImpl: fakeFetch((url) => {
      calls++;
      return url.includes("q=Writing") || url.includes("q=writing")
        ? jsonRes({ skills: [SKILL_HIT] })
        : null;
    }),
  });
  const first = await dir.search("Writing");
  const second = await dir.search(" writing ");
  expect(first[0]?.id).toBe("owner/repo/writing");
  expect(second[0]?.id).toBe("owner/repo/writing");
  expect(calls).toBe(1);
});

test("community search returns stale cache when skills.sh rate limits", async () => {
  let mode: "ok" | "limited" = "ok";
  const clock = fakeClock();
  const dir = new CommunityDirectory({
    endpoint: "https://x/api/search",
    now: clock.now,
    sleep: clock.sleep,
    freshTtlMs: 0,
    fetchImpl: fakeFetch(() =>
      mode === "ok"
        ? jsonRes({ skills: [SKILL_HIT] })
        : new Response("", { status: 429 }),
    ),
  });
  await dir.search("writing");
  mode = "limited";
  clock.state.t += 1;
  const skills = await dir.search("writing");
  expect(skills[0]?.id).toBe("owner/repo/writing");
});

test("community search maps a persistent 429 to rate_limited when no cache", async () => {
  const clock = fakeClock();
  const dir = new CommunityDirectory({
    endpoint: "https://x/api/search",
    now: clock.now,
    sleep: clock.sleep,
    fetchImpl: fakeFetch(() => new Response("", { status: 429 })),
  });
  const err = await dir.search("writing").catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("rate_limited");
});

test("queries under two chars return empty without a network call", async () => {
  const dir = new CommunityDirectory({
    fetchImpl: fakeFetch(() => {
      throw new Error("should not fetch");
    }),
  });
  expect(await dir.search(" a ")).toEqual([]);
});

test("popular uses its own cache slot and truncates to 20", async () => {
  let calls = 0;
  const clock = fakeClock();
  const many = Array.from({ length: 30 }, (_, i) => ({
    ...SKILL_HIT,
    id: `a/b/s${i}`,
    skillId: `s${i}`,
  }));
  const dir = new CommunityDirectory({
    endpoint: "https://x/api/search",
    now: clock.now,
    sleep: clock.sleep,
    fetchImpl: fakeFetch(() => {
      calls++;
      return jsonRes({ skills: many });
    }),
  });
  const first = await dir.popular();
  const second = await dir.popular();
  expect(first.length).toBe(20);
  expect(second.length).toBe(20);
  expect(calls).toBe(1);
});

// ── fetchSkillMdAtPath ─────────────────────────────────────────────

test("fetchSkillMdAtPath fetches the HEAD ref (default branch)", async () => {
  let fetchedUrl = "";
  const md = await fetchSkillMdAtPath(
    fakeFetch((url) => {
      fetchedUrl = url;
      return new Response("body");
    }),
    "owner/repo",
    "skills/x/SKILL.md",
  );
  expect(md).toBe("body");
  expect(fetchedUrl).toContain("/HEAD/");
});

test("fetchSkillMdAtPath types a total miss as offline", async () => {
  const err = await fetchSkillMdAtPath(
    fakeFetch(() => new Response("", { status: 404 })),
    "owner/repo",
    "missing/SKILL.md",
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("offline");
});

// ── listSkillsFromRepo ─────────────────────────────────────────────

const TREE = {
  tree: [
    { path: "research/SKILL.md", type: "blob" },
    { path: "README.md", type: "blob" },
  ],
  truncated: false,
};
const RESEARCH_MD =
  "---\nname: research\ndescription: Deep research\n---\n\n# Research\n\nSteps.";

const repoRoutes: Route[] = [
  (url) =>
    url === "https://api.github.com/repos/owner/repo" ? jsonRes({}) : null,
  (url) => (url.includes("/git/trees/HEAD") ? jsonRes(TREE) : null),
  (url) =>
    url.includes("raw.githubusercontent.com/owner/repo/HEAD/research/SKILL.md")
      ? new Response(RESEARCH_MD)
      : null,
];

test("listSkillsFromRepo rejects garbage before any network call", async () => {
  const err = await listSkillsFromRepo(
    fakeFetch(() => {
      throw new Error("should not fetch");
    }),
    "reconciliation",
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("invalid_repo_source");
});

test("listSkillsFromRepo surfaces typed repo errors", async () => {
  const notFound = await listSkillsFromRepo(
    fakeFetch(() => new Response("", { status: 404 })),
    "owner/gone",
  ).catch((e) => e);
  expect((notFound as SkillRemoteError).kind).toBe("repo_not_found");

  const empty = await listSkillsFromRepo(
    fakeFetch(
      (url) =>
        url === "https://api.github.com/repos/owner/repo" ? jsonRes({}) : null,
      (url) =>
        url.includes("/git/trees/HEAD")
          ? jsonRes({ tree: [], truncated: false })
          : null,
    ),
    "owner/repo",
  ).catch((e) => e);
  expect((empty as SkillRemoteError).kind).toBe("repo_no_skills");
});

test("listSkillsFromRepo returns one RepoSkill per SKILL.md", async () => {
  const { source, skills } = await listSkillsFromRepo(
    fakeFetch(...repoRoutes),
    "https://github.com/owner/repo",
  );
  expect(source).toBe("owner/repo");
  expect(skills).toEqual([
    {
      id: "research",
      name: "Research",
      description: "Deep research",
      path: "research/SKILL.md",
    },
  ]);
});

// ── installs ───────────────────────────────────────────────────────

const ROOT = "ws/w1/a1/workspace";

test("installSkillsFromRepo writes the composed skill and is idempotent", async () => {
  const vfs = new MemoryVfs();
  const skills = [
    {
      id: "research",
      name: "Research",
      description: "Deep research",
      path: "research/SKILL.md",
    },
  ];
  const installed = await installSkillsFromRepo(
    fakeFetch(...repoRoutes),
    vfs,
    ROOT,
    "owner/repo",
    skills,
  );
  expect(installed).toEqual(["research"]);
  const md = await vfs.readText(`${ROOT}/.agents/skills/research/SKILL.md`);
  expect(md).toContain("name: research");
  expect(md).toContain("featured: true");

  // Local edits survive a reinstall (healthy copy = no-op).
  await vfs.writeText(
    `${ROOT}/.agents/skills/research/SKILL.md`,
    "---\nname: research\ndescription: edited\n---\n\nlocal edits\n",
  );
  await installSkillsFromRepo(
    fakeFetch(...repoRoutes),
    vfs,
    ROOT,
    "owner/repo",
    skills,
  );
  const kept = await vfs.readText(`${ROOT}/.agents/skills/research/SKILL.md`);
  expect(kept).toContain("local edits");
});

test("installSkillsFromRepo rejects ids that are not clean slugs", async () => {
  const err = await installSkillsFromRepo(
    fakeFetch(...repoRoutes),
    new MemoryVfs(),
    ROOT,
    "owner/repo",
    [{ id: "../escape", name: "x", description: "", path: "x/SKILL.md" }],
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("validation");
});

test("installCommunitySkill finds the skill under common paths and uses the frontmatter slug", async () => {
  const vfs = new MemoryVfs();
  const slug = await installCommunitySkill(
    fakeFetch((url) =>
      url.includes("owner/repo/HEAD/skills/writing/SKILL.md")
        ? new Response(
            "---\nname: writing-plans\ndescription: d\n---\n\n# Writing\n\nBody.",
          )
        : null,
    ),
    vfs,
    ROOT,
    "owner/repo",
    "writing",
  );
  expect(slug).toBe("writing-plans");
  const md = await vfs.readText(
    `${ROOT}/.agents/skills/writing-plans/SKILL.md`,
  );
  expect(md).toContain("name: writing-plans");
});

test("installCommunitySkill surfaces skill_not_in_repo when nothing matches", async () => {
  const err = await installCommunitySkill(
    fakeFetch(() => new Response("", { status: 404 })),
    new MemoryVfs(),
    ROOT,
    "owner/repo",
    "ghost",
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
});

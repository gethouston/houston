import { expect, test } from "vitest";
import { locateSkillMd } from "./github-lookup";
import { GoneRegistry } from "./gone-registry";
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

test("locateSkillMd throws skill_not_in_repo when a live repo holds nothing matching", async () => {
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch((url) =>
      url.includes("git/trees/HEAD")
        ? jsonRes({ tree: [{ path: "README.md", type: "blob" }] })
        : new Response("", { status: 404 }),
    ),
    "owner/repo",
    "ghost",
    { gone },
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
  // The recursive scan listed the whole repo, so the absence is proven and
  // search must stop offering the card (PRODUCT-1729).
  expect(gone.isGone("owner/repo", "ghost")).toBe(true);
  expect(gone.isGone("owner/repo")).toBe(false);
});

test("locateSkillMd throws repo_not_found when GitHub answers 404 for the repo (PRODUCT-1729)", async () => {
  // The HOUSTON-APP-5CS shape: sales-skills/sales was deleted upstream but
  // skills.sh keeps listing sales-digital-products. Every raw-CDN guess AND
  // the tree call 404.
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch(() => new Response("", { status: 404 })),
    "sales-skills/sales",
    "sales-digital-products",
    { gone },
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("repo_not_found");
  expect(gone.isGone("sales-skills/sales")).toBe(true);
});

test("locateSkillMd reports a GitHub rate limit instead of a missing skill, and records nothing", async () => {
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch((url) =>
      url.includes("api.github.com")
        ? new Response("rate limited", { status: 403 })
        : new Response("", { status: 404 }),
    ),
    "owner/repo",
    "writing-great-skills",
    { gone },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("github_rate_limited");
  expect(gone.isGone("owner/repo", "writing-great-skills")).toBe(false);
});

test("locateSkillMd does not record a miss from a truncated recursive listing", async () => {
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch((url) =>
      url.includes("recursive=1")
        ? jsonRes({ tree: [], truncated: true })
        : url.includes("git/trees/HEAD")
          ? jsonRes({ tree: [] })
          : new Response("", { status: 404 }),
    ),
    "owner/repo",
    "ghost",
    { gone },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(gone.isGone("owner/repo", "ghost")).toBe(false);
});

test("locateSkillMd resolves an id slugified from a Title Case frontmatter name (PRODUCT-1729)", async () => {
  // The HOUSTON-APP-5D7 shape: claude-office-skills/skills keeps
  // `pdf-ocr/SKILL.md` declaring `name: PDF OCR Extraction`; skills.sh lists it
  // as `pdf-ocr-extraction`. The shallow scan sees the root `pdf-ocr` dir
  // (and the looser `pdf` sibling), fetches both, and the slugified name wins.
  let recursiveCalls = 0;
  const PDF_OCR = "---\nname: PDF OCR Extraction\n---\n\n# PDF OCR";
  const PDF = "---\nname: PDF Tools\n---\n\n# PDF";
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
                { path: "pdf", type: "tree", sha: "p1" },
                { path: "pdf-ocr", type: "tree", sha: "p2" },
                { path: "excel", type: "tree", sha: "p3" },
              ],
            })
          : null,
      rawAt("pdf-ocr/SKILL.md", PDF_OCR),
      rawAt("pdf/SKILL.md", PDF),
    ),
    "owner/repo",
    "pdf-ocr-extraction",
    { deepScan: false },
  );
  expect(md).toBe(PDF_OCR);
  expect(recursiveCalls).toBe(0);
});

test("locateSkillMd resolves a renamed skill whose old id is a kebab prefix, via the recursive scan (PRODUCT-1729)", async () => {
  // The HOUSTON-APP-5D7 shape: anthropics/knowledge-work-plugins renamed
  // `user-research-synthesis` to `design/skills/user-research/SKILL.md`
  // (frontmatter `name: user-research`); skills.sh still lists the old id.
  // Nothing in the repo contains the full id, so only the prefix rule finds
  // it. A one-segment `user/SKILL.md` sibling must NOT be taken.
  const USER_RESEARCH = "---\nname: user-research\n---\n\n# User Research";
  const USER = "---\nname: user\n---\n\n# User";
  const md = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("recursive=1")
          ? jsonRes({
              tree: [
                { path: "design/skills/user/SKILL.md", type: "blob" },
                { path: "design/skills/user-research/SKILL.md", type: "blob" },
                { path: "sales/skills/lead-research/SKILL.md", type: "blob" },
              ],
            })
          : url.includes("git/trees/HEAD")
            ? jsonRes({
                tree: [
                  { path: "design", type: "tree", sha: "d1" },
                  { path: "sales", type: "tree", sha: "s1" },
                ],
              })
            : null,
      rawAt("design/skills/user-research/SKILL.md", USER_RESEARCH),
      rawAt("design/skills/user/SKILL.md", USER),
    ),
    "owner/repo",
    "user-research-synthesis",
  );
  expect(md).toBe(USER_RESEARCH);
});

test("locateSkillMd never takes a one-segment prefix directory for a longer id", async () => {
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD")
          ? jsonRes({
              tree: [{ path: "user/SKILL.md", type: "blob" }],
            })
          : null,
      rawAt("user/SKILL.md", "---\nname: user\n---\n\n# User"),
    ),
    "owner/repo",
    "user-research-synthesis",
    { gone },
  ).catch((e) => e);
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

test("locateSkillMd resolves a plugin-marketplace skill via the manifest probe (PRODUCT-1382)", async () => {
  // The Sentry HOUSTON-APP-4XZ shape: anthropics/knowledge-work-plugins keeps
  // `daily-briefing` at sales/skills/daily-briefing/SKILL.md. The manifest
  // probe must resolve it on the preview path (deepScan: false) WITHOUT any
  // rate-limited api.github.com call. Object-shaped (external) plugin sources
  // must be skipped, not crash the probe.
  let apiCalls = 0;
  const manifest = JSON.stringify({
    plugins: [
      { name: "productivity", source: "./productivity" },
      { name: "external", source: { source: "github", repo: "o/r" } },
      { name: "sales", source: "./sales" },
    ],
  });
  const md = await locateSkillMd(
    fakeFetch(
      (url) => {
        if (url.includes("api.github.com")) apiCalls++;
        return null;
      },
      rawAt(".claude-plugin/marketplace.json", manifest),
      rawAt("sales/skills/daily-briefing/SKILL.md", "briefing-body"),
    ),
    "owner/repo",
    "daily-briefing",
    { deepScan: false },
  );
  expect(md).toBe("briefing-body");
  expect(apiCalls).toBe(0);
});

test("locateSkillMd falls through to the shallow scan when no marketplace plugin holds the skill", async () => {
  const manifest = JSON.stringify({
    plugins: [{ name: "sales", source: "./sales" }],
  });
  const md = await locateSkillMd(
    fakeFetch(
      rawAt(".claude-plugin/marketplace.json", manifest),
      (url) =>
        url.endsWith("git/trees/HEAD")
          ? jsonRes({
              tree: [{ path: "daily-briefing-kit", type: "tree", sha: "d1" }],
            })
          : null,
      rawAt(
        "daily-briefing-kit/SKILL.md",
        "---\nname: daily-briefing\n---\n\n# Briefing",
      ),
    ),
    "owner/repo",
    "daily-briefing",
    { deepScan: false },
  );
  expect(md).toBe("---\nname: daily-briefing\n---\n\n# Briefing");
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

test("locateSkillMd rejects a prefix directory whose frontmatter names a different skill", async () => {
  // Installing the WRONG skill is worse than a 404: `user-research/` declaring
  // `name: competitor-analysis` is some other skill under a matching folder.
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD")
          ? jsonRes({
              tree: [{ path: "design/user-research/SKILL.md", type: "blob" }],
            })
          : null,
      rawAt(
        "design/user-research/SKILL.md",
        "---\nname: competitor-analysis\n---\n\n# Competitors",
      ),
    ),
    "owner/repo",
    "user-research-synthesis",
    { gone },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(gone.isGone("owner/repo", "user-research-synthesis")).toBe(true);
});

test("locateSkillMd does not record a miss when a listed candidate could not be read", async () => {
  // The tree lists a plausible path but its raw fetch fails (CDN 503): the
  // repo was NOT proven empty of the skill, so nothing is hidden for a day.
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD")
          ? jsonRes({
              tree: [{ path: "tools/deep-research/SKILL.md", type: "blob" }],
            })
          : null,
      (url) =>
        url.includes("tools/deep-research/SKILL.md")
          ? new Response("", { status: 503 })
          : null,
    ),
    "owner/repo",
    "deep-research",
    { gone },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("offline");
  expect(gone.isGone("owner/repo", "deep-research")).toBe(false);
});

test("locateSkillMd does not record a miss when the recursive candidate cap left paths unread", async () => {
  const gone = new GoneRegistry();
  const blobs = Array.from({ length: 45 }, (_, i) => ({
    path: `packs/p${i}/writing-plans-${i}/SKILL.md`,
    type: "blob",
  }));
  const err = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD") ? jsonRes({ tree: blobs }) : null,
      (url) =>
        url.includes("raw.githubusercontent.com") && url.includes("packs/")
          ? new Response("---\nname: other\n---\n\n# Other")
          : null,
    ),
    "owner/repo",
    "writing-plans",
    { gone },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(gone.isGone("owner/repo", "writing-plans")).toBe(false);
});

test("locateSkillMd confirms a tree 404 against the repo endpoint before calling the repo gone", async () => {
  // A 404 on git/trees/HEAD alone is "resource not found" (the ref, say); the
  // repo itself still answers 200, so it must not be hidden for a day.
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch((url) =>
      url.endsWith("api.github.com/repos/owner/repo")
        ? jsonRes({ full_name: "owner/repo" })
        : new Response("", { status: 404 }),
    ),
    "owner/repo",
    "ghost",
    { gone },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("offline");
  expect(gone.isGone("owner/repo")).toBe(false);
});

test("locateSkillMd with deepScan: false reports a rate-limited shallow scan as such, not as a missing skill", async () => {
  const err = await locateSkillMd(
    fakeFetch((url) =>
      url.includes("api.github.com")
        ? new Response("", { status: 403 })
        : new Response("", { status: 404 }),
    ),
    "owner/repo",
    "ghost",
    { deepScan: false },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("github_rate_limited");
});

test("locateSkillMd finds a skill whose directory shares nothing with its declared name", async () => {
  // skills.sh keys on the frontmatter `name:`, so `odd/location/SKILL.md`
  // declaring `name: ghost` IS the `ghost` skill. Nothing in the path
  // resembles the id; only reading every SKILL.md finds it — and without that
  // read the recursive scan could never prove the skill absent.
  const md = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD")
          ? jsonRes({
              tree: [
                { path: "odd/location/SKILL.md", type: "blob" },
                { path: "other/SKILL.md", type: "blob" },
              ],
            })
          : null,
      rawAt("odd/location/SKILL.md", "---\nname: ghost\n---\n\n# Ghost"),
      rawAt("other/SKILL.md", "---\nname: other\n---\n\n# Other"),
    ),
    "owner/repo",
    "ghost",
  );
  expect(md).toBe("---\nname: ghost\n---\n\n# Ghost");
});

test("locateSkillMd with deepScan: false keeps a rate-limited skills/ subtree listing as such", async () => {
  const err = await locateSkillMd(
    fakeFetch((url) => {
      if (url.endsWith("git/trees/HEAD"))
        return jsonRes({ tree: [{ path: "skills", type: "tree", sha: "s1" }] });
      if (url.endsWith("git/trees/s1"))
        return new Response("", { status: 403 });
      return new Response("", { status: 404 });
    }),
    "owner/repo",
    "ghost",
    { deepScan: false },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("github_rate_limited");
});

test("locateSkillMd types a candidate whose body stream resets as offline, not missing", async () => {
  const gone = new GoneRegistry();
  const err = await locateSkillMd(
    fakeFetch(
      (url) =>
        url.includes("git/trees/HEAD")
          ? jsonRes({ tree: [{ path: "tools/ghost/SKILL.md", type: "blob" }] })
          : null,
      (url) =>
        url.includes("tools/ghost/SKILL.md")
          ? new Response(
              new ReadableStream({
                pull(controller) {
                  controller.error(new Error("stream reset"));
                },
              }),
            )
          : null,
    ),
    "owner/repo",
    "ghost",
    { gone },
  ).catch((e) => e);
  expect((err as SkillRemoteError).kind).toBe("offline");
  expect(gone.isGone("owner/repo", "ghost")).toBe(false);
});

import { expect, test } from "vitest";
import {
  MAX_PREVIEW_CONTENT_CHARS,
  PREVIEW_CONTENT_CLIPPED_MARKER,
  PreviewDirectory,
  previewCommunitySkill,
} from "./preview";
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

const raw =
  (skillId: string, body: string): Route =>
  (url) =>
    url.includes(`raw.githubusercontent.com/owner/repo/HEAD/skills/${skillId}/`)
      ? new Response(body)
      : null;

const FULL_MD = `---
name: writing
title: Writing Plans
description: Draft compelling campaign plans
image: rocket
category: Marketing
integrations:
  - gmail
  - googledocs
tags:
  - writing
  - marketing
---

# Writing

Body.`;

/** The body FULL_MD must round-trip: everything after the closing `---`. */
const FULL_MD_BODY = "\n# Writing\n\nBody.";

const MINIMAL_MD = `---
name: minimal
description: Just a description
---

# Minimal

Body.`;

// Matches the frontmatter regex but the YAML itself is invalid (unclosed flow
// sequence), so parseSkillMd returns {error} — preview must NOT throw.
const MALFORMED_MD = `---
foo: [1, 2
title: Broken
---

# Broken

Body.`;

test("previewCommunitySkill returns full detail from a rich SKILL.md", async () => {
  const preview = await previewCommunitySkill(
    fakeFetch(raw("writing", FULL_MD)),
    "owner/repo",
    "writing",
  );
  expect(preview).toEqual({
    title: "Writing Plans",
    description: "Draft compelling campaign plans",
    image: "rocket",
    category: "Marketing",
    tags: ["writing", "marketing"],
    integrations: ["gmail", "googledocs"],
    content: FULL_MD_BODY,
  });
});

test("previewCommunitySkill returns the body with frontmatter stripped", async () => {
  const preview = await previewCommunitySkill(
    fakeFetch(raw("writing", FULL_MD)),
    "owner/repo",
    "writing",
  );
  // The YAML block is gone...
  expect(preview.content).not.toContain("---");
  expect(preview.content).not.toContain("category: Marketing");
  // ...and every line of the procedure survives verbatim.
  expect(preview.content).toBe(FULL_MD_BODY);
  expect(preview.content).toContain("# Writing");
  expect(preview.content).toContain("Body.");
});

test("previewCommunitySkill nulls optional fields on a minimal SKILL.md", async () => {
  const preview = await previewCommunitySkill(
    fakeFetch(raw("minimal", MINIMAL_MD)),
    "owner/repo",
    "minimal",
  );
  expect(preview).toEqual({
    title: null,
    description: "Just a description",
    image: null,
    category: null,
    tags: [],
    // No `integrations:` in the frontmatter → the empty list, never null: the
    // UI can map over it without a guard.
    integrations: [],
    content: "\n# Minimal\n\nBody.",
  });
});

test("previewCommunitySkill throws skill_not_in_repo when nothing matches", async () => {
  const err = await previewCommunitySkill(
    fakeFetch(() => new Response("", { status: 404 })),
    "owner/repo",
    "ghost",
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
});

test("previewCommunitySkill rejects an unparseable source before any fetch", async () => {
  const err = await previewCommunitySkill(
    fakeFetch(() => {
      throw new Error("should not fetch");
    }),
    "reconciliation",
    "writing",
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("invalid_repo_source");
});

test("previewCommunitySkill never runs the expensive RECURSIVE tree scan", async () => {
  // A skill genuinely nested somewhere unguessable would need the recursive
  // whole-repo scan to be found — preview passes `deepScan: false` to skip that
  // expensive, rate-limited call (see preview.ts) and reports skill_not_in_repo
  // fast instead of hanging the marketplace on a card click. The cheap shallow
  // scan (non-recursive) may still probe, but the recursive one never fires.
  let recursiveCalls = 0;
  const err = await previewCommunitySkill(
    fakeFetch((url) => {
      if (url.includes("recursive=1")) recursiveCalls++;
      return null;
    }),
    "owner/repo",
    "nested-somewhere",
  ).catch((e) => e);
  expect(err).toBeInstanceOf(SkillRemoteError);
  expect((err as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(recursiveCalls).toBe(0);
});

test("previewCommunitySkill degrades to the empty shape on malformed frontmatter", async () => {
  const preview = await previewCommunitySkill(
    fakeFetch(raw("broken", MALFORMED_MD)),
    "owner/repo",
    "broken",
  );
  expect(preview).toEqual({
    title: null,
    description: "",
    image: null,
    category: null,
    tags: [],
    integrations: [],
    content: null,
  });
});

test("previewCommunitySkill clips an oversized body to the cap, with a visible marker", async () => {
  const hugeBody = "x".repeat(MAX_PREVIEW_CONTENT_CHARS + 5_000);
  const md = `---\nname: huge\ndescription: Big\n---\n${hugeBody}`;
  const preview = await previewCommunitySkill(
    fakeFetch(raw("huge", md)),
    "owner/repo",
    "huge",
  );
  expect(preview.content).toHaveLength(
    MAX_PREVIEW_CONTENT_CHARS + PREVIEW_CONTENT_CLIPPED_MARKER.length,
  );
  expect(preview.content?.endsWith(PREVIEW_CONTENT_CLIPPED_MARKER)).toBe(true);

  // A body exactly at the cap is untouched — no marker, no clip. The parsed
  // body keeps the frontmatter's trailing "\n", so it is 1 + this string.
  const exact = "y".repeat(MAX_PREVIEW_CONTENT_CHARS - 1);
  const exactPreview = await previewCommunitySkill(
    fakeFetch(raw("exact", `---\nname: exact\ndescription: E\n---\n${exact}`)),
    "owner/repo",
    "exact",
  );
  // `content` is the body AFTER the frontmatter's trailing newline; parseSkillMd
  // keeps the leading "\n", so compare the tail.
  expect(exactPreview.content?.endsWith(exact)).toBe(true);
  expect(exactPreview.content?.includes("[...]")).toBe(false);
});

// ── PreviewDirectory (in-memory cache) ─────────────────────────────

test("PreviewDirectory evicts the oldest entry beyond maxEntries", async () => {
  // Entries carry whole SKILL.md bodies and nothing sweeps the map (TTL is
  // only checked on a read of the same key), so the FIFO cap is the only
  // thing bounding memory across a long browse session.
  const fetchImpl = fakeFetch((url) => {
    const m = url.match(/\/HEAD\/skills\/([^/]+)\//);
    return m ? new Response(FULL_MD) : null;
  });
  let rawFetches = 0;
  const counting: typeof fetch = async (input, init) => {
    if (String(input).includes("raw.githubusercontent.com")) rawFetches++;
    return fetchImpl(input, init);
  };
  const dir = new PreviewDirectory({ now: () => 0, maxEntries: 2 });
  await dir.preview(counting, "owner/repo", "a");
  await dir.preview(counting, "owner/repo", "b");
  await dir.preview(counting, "owner/repo", "c"); // evicts "a"
  const afterFill = rawFetches;

  // "b" and "c" still cached — no new fetches.
  await dir.preview(counting, "owner/repo", "b");
  await dir.preview(counting, "owner/repo", "c");
  expect(rawFetches).toBe(afterFill);

  // "a" was evicted — refetches.
  await dir.preview(counting, "owner/repo", "a");
  expect(rawFetches).toBeGreaterThan(afterFill);
});

test("PreviewDirectory serves the cached preview on the second call", async () => {
  let rawFetches = 0;
  const fetchImpl = fakeFetch((url) => {
    if (!url.includes("raw.githubusercontent.com")) return null;
    rawFetches++;
    return url.includes("/HEAD/skills/writing/") ? new Response(FULL_MD) : null;
  });
  const dir = new PreviewDirectory({ now: () => 0 });
  const first = await dir.preview(fetchImpl, "owner/repo", "writing");
  const second = await dir.preview(fetchImpl, "owner/repo", "writing");
  expect(first).toEqual(second);
  expect(first.title).toBe("Writing Plans");
  // The cache is field-agnostic: integrations + content ride along untouched.
  expect(second.integrations).toEqual(["gmail", "googledocs"]);
  expect(second.content).toBe(FULL_MD_BODY);
  // Only the first call fetched (3 concurrent path guesses); the second is cached.
  expect(rawFetches).toBe(3);
});

test("PreviewDirectory negatively caches a failure for 10min, then retries", async () => {
  let attempts = 0;
  const clock = { t: 0 };
  const fetchImpl = fakeFetch((url) => {
    if (url.includes("raw.githubusercontent.com")) {
      attempts++;
      return new Response("", { status: 404 });
    }
    if (url.includes("git/trees")) return new Response("", { status: 404 });
    return null;
  });
  const dir = new PreviewDirectory({ now: () => clock.t });

  const e1 = await dir
    .preview(fetchImpl, "owner/repo", "ghost")
    .catch((e) => e);
  expect((e1 as SkillRemoteError).kind).toBe("skill_not_in_repo");
  const afterFirst = attempts;
  expect(afterFirst).toBeGreaterThan(0);

  // Within 10min → negative cache, no new fetches.
  clock.t = 9 * 60_000;
  const e2 = await dir
    .preview(fetchImpl, "owner/repo", "ghost")
    .catch((e) => e);
  expect((e2 as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(attempts).toBe(afterFirst);

  // After 10min → cache expired, refetches.
  clock.t = 11 * 60_000;
  const e3 = await dir
    .preview(fetchImpl, "owner/repo", "ghost")
    .catch((e) => e);
  expect((e3 as SkillRemoteError).kind).toBe("skill_not_in_repo");
  expect(attempts).toBeGreaterThan(afterFirst);
});

test("PreviewDirectory does not cache invalid_repo_source", async () => {
  let fetchCalls = 0;
  const fetchImpl = fakeFetch(() => {
    fetchCalls++;
    return null;
  });
  const dir = new PreviewDirectory({ now: () => 0 });
  const e1 = await dir
    .preview(fetchImpl, "reconciliation", "writing")
    .catch((e) => e);
  const e2 = await dir
    .preview(fetchImpl, "reconciliation", "writing")
    .catch((e) => e);
  expect((e1 as SkillRemoteError).kind).toBe("invalid_repo_source");
  expect((e2 as SkillRemoteError).kind).toBe("invalid_repo_source");
  // Rejected before any fetch, both times — never cached, never fetched.
  expect(fetchCalls).toBe(0);
});

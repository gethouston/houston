import { deepStrictEqual, ok } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolvePendingSkillActivity } from "../src/components/skills-view/skill-editor-model.ts";
import type { SkillSummary } from "../src/lib/types.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

const summary = (over?: Partial<SkillSummary>): SkillSummary => ({
  name: "meeting-prep",
  title: null,
  description: "",
  version: 1,
  tags: [],
  created: null,
  last_used: null,
  category: null,
  featured: false,
  integrations: [],
  image: null,
  inputs: [],
  prompt_template: null,
  ...over,
});

const row = (slug: string, activityId: string | null) => ({
  slug,
  summary: summary({ name: slug, setup_activity_id: activityId }),
});

describe("resolvePendingSkillActivity", () => {
  it("does nothing when no chat has notified", () => {
    deepStrictEqual(
      resolvePendingSkillActivity({
        rows: [row("meeting-prep", "a1")],
        rowsLoaded: true,
        activityId: null,
      }),
      { kind: "wait" },
    );
  });

  it("opens the skill the finished chat built", () => {
    const target = row("meeting-prep", "a1");
    deepStrictEqual(
      resolvePendingSkillActivity({
        rows: [row("other", "a9"), target],
        rowsLoaded: true,
        activityId: "a1",
      }),
      { kind: "open", row: target },
    );
  });

  it("waits for the rows before deciding nothing claims the id", () => {
    deepStrictEqual(
      resolvePendingSkillActivity({
        rows: [],
        rowsLoaded: false,
        activityId: "a1",
      }),
      { kind: "wait" },
    );
  });

  it("drops an id no loaded row claims, instead of keeping it for the session", () => {
    // A lingering id hijacks the NEXT skill chat the user opens.
    deepStrictEqual(
      resolvePendingSkillActivity({
        rows: [row("other", "a9")],
        rowsLoaded: true,
        activityId: "a1",
      }),
      { kind: "drop" },
    );
  });
});

describe("the Skills library consumes the pending id itself", () => {
  const src = read("../src/components/skills-view/use-skills-editor-nav.ts");

  it("clears the id the moment it resolves one, mounted chat or not", () => {
    // Only a mounted chat cleared it before. A phone does not auto-mount the
    // chat, so Back re-ran the effect and reopened the editor forever.
    ok(src.includes("resolvePendingSkillActivity"), "uses the pure decision");
    ok(
      src.includes("setPendingSkillChatActivityId(null)"),
      "the nav is itself a consumer of the one-shot id",
    );
  });

  it("knows whether the rows have landed, so a miss is a real miss", () => {
    ok(src.includes("rowsLoaded"), "takes the rows' loaded state");
    ok(
      read("../src/components/skills-view/skills-view.tsx").includes(
        "rowsLoaded",
      ),
      "the library passes it",
    );
  });
});

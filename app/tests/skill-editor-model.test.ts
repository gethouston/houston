import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  reconcileSkillDraft,
  resolveSkillEditorView,
  seedSkillDraft,
  skillDraftDirty,
  skillRowForActivity,
} from "../src/components/skills-view/skill-editor-model.ts";
import type { SkillSummary } from "../src/lib/types.ts";

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

describe("resolveSkillEditorView", () => {
  it("opens a Houston-written skill on its workflow", () => {
    strictEqual(resolveSkillEditorView(null, true), "workflow");
  });

  it("opens an imported skill on its text, since it has no steps", () => {
    strictEqual(resolveSkillEditorView(null, false), "text");
  });

  it("keeps the view the user (or the chat) pinned", () => {
    strictEqual(resolveSkillEditorView("text", true), "text");
    strictEqual(resolveSkillEditorView("workflow", false), "workflow");
  });
});

describe("reconcileSkillDraft", () => {
  it("follows the server while the draft is untouched", () => {
    const next = reconcileSkillDraft(seedSkillDraft("v1"), "v2");
    strictEqual(next.text, "v2");
    strictEqual(next.baseline, "v2");
    strictEqual(next.stale, false);
  });

  it("keeps a dirty draft and flags it when the chat rewrites the skill", () => {
    const typed = { ...seedSkillDraft("v1"), text: "mine" };
    const next = reconcileSkillDraft(typed, "v2");
    strictEqual(next.text, "mine");
    strictEqual(next.stale, true);
    strictEqual(skillDraftDirty(next), true);
  });

  it("returns the same object once flagged, so a render-time reconcile settles", () => {
    const typed = { ...seedSkillDraft("v1"), text: "mine" };
    const flagged = reconcileSkillDraft(typed, "v2");
    strictEqual(reconcileSkillDraft(flagged, "v2"), flagged);
    strictEqual(reconcileSkillDraft(flagged, "v3"), flagged);
  });

  it("adopts a server copy that already matches the screen (the user's own save)", () => {
    const typed = { ...seedSkillDraft("v1"), text: "mine" };
    const next = reconcileSkillDraft(typed, "mine");
    strictEqual(next.baseline, "mine");
    strictEqual(next.stale, false);
    strictEqual(skillDraftDirty(next), false);
  });

  it("leaves an unchanged server copy alone", () => {
    const draft = seedSkillDraft("v1");
    strictEqual(reconcileSkillDraft(draft, "v1"), draft);
  });
});

describe("skillRowForActivity", () => {
  const rows = [
    { slug: "a", summary: summary({ name: "a", setup_activity_id: "act-1" }) },
    { slug: "b", summary: summary({ name: "b", setup_activity_id: null }) },
  ];

  it("finds the skill its setup chat built", () => {
    strictEqual(skillRowForActivity(rows, "act-1")?.slug, "a");
  });

  it("answers null for an id no skill claims", () => {
    strictEqual(skillRowForActivity(rows, "act-9"), null);
  });

  it("answers null with no pending id, never an unstamped row", () => {
    strictEqual(skillRowForActivity(rows, null), null);
  });
});

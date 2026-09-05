import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PortableInventoryPreview } from "@houston-ai/engine-client";
import {
  copyWizardSteps,
  fullCopySelection,
  toCopySelection,
} from "../src/components/copy-agent/copy-agent-wizard-model.ts";

const skill = (slug: string) => ({
  slug,
  description: "",
  category: null,
  image: null,
  integrations: [],
  featured: false,
});
const routine = (id: string) => ({
  id,
  name: id,
  promptExcerpt: "",
  enabled: true,
  integrations: [],
});
const learning = (id: string) => ({ id, text: id, createdAt: "" });

const full: PortableInventoryPreview = {
  claudeMd: { byteCount: 12, excerpt: "You are Ops." },
  skills: [skill("a"), skill("b")],
  routines: [routine("r1")],
  learnings: [learning("l1"), learning("l2")],
};

describe("copyWizardSteps", () => {
  it("is only the source list before a source is read", () => {
    deepStrictEqual(copyWizardSteps(null), ["source"]);
  });

  it("walks every content screen the source fills, then naming", () => {
    deepStrictEqual(copyWizardSteps(full), [
      "source",
      "instructions",
      "routines",
      "skills",
      "name",
    ]);
  });

  it("skips the list screens the source has nothing for", () => {
    deepStrictEqual(
      copyWizardSteps({
        claudeMd: null,
        skills: [],
        routines: [routine("r1")],
        learnings: [],
      }),
      ["source", "instructions", "routines", "name"],
    );
  });

  it("always shows the know screen: the chats choice exists for every source", () => {
    deepStrictEqual(
      copyWizardSteps({
        claudeMd: null,
        skills: [],
        routines: [],
        learnings: [],
      }),
      ["source", "instructions", "name"],
    );
  });
});

describe("fullCopySelection", () => {
  it("starts with everything on", () => {
    const sel = fullCopySelection(full);
    strictEqual(sel.claudeMd, true);
    deepStrictEqual([...sel.skillSlugs], ["a", "b"]);
    deepStrictEqual([...sel.routineIds], ["r1"]);
    deepStrictEqual([...sel.learningIds], ["l1", "l2"]);
  });

  it("leaves the job description off when the source has none", () => {
    ok(!fullCopySelection({ ...full, claudeMd: null }).claudeMd);
  });
});

describe("toCopySelection", () => {
  it("carries exactly what is still switched on", () => {
    const sel = fullCopySelection(full);
    sel.skillSlugs.delete("a");
    sel.learningIds.delete("l2");
    sel.claudeMd = false;
    deepStrictEqual(toCopySelection(sel), {
      includeClaudeMd: false,
      includeSkillSlugs: ["b"],
      includeRoutineIds: ["r1"],
      includeLearningIds: ["l1"],
    });
  });
});

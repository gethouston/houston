import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeSharedIntoAgentSkills } from "../src/lib/agent-shared-skills.ts";
import type { SkillSummary } from "../src/lib/types.ts";

const skill = (name: string): SkillSummary => ({
  name,
  title: null,
  description: `${name} description`,
  version: 1,
  tags: [],
  created: "2026-01-01",
  last_used: null,
  category: null,
  featured: false,
  integrations: [],
  image: null,
  setup_activity_id: null,
  inputs: [],
  prompt_template: null,
});

describe("mergeSharedIntoAgentSkills", () => {
  it("appends manifest-enabled store skills to the local list", () => {
    const merged = mergeSharedIntoAgentSkills({
      local: [skill("local-one")],
      shared: [skill("meeting-prep"), skill("weekly-update")],
      enabled: new Set(["meeting-prep"]),
    });
    assert.deepEqual(
      merged.skills.map((s) => s.name),
      ["local-one", "meeting-prep"],
    );
    assert.deepEqual([...merged.sharedNames], ["meeting-prep"]);
  });

  it("keeps store skills the manifest does not enable out of the list", () => {
    const merged = mergeSharedIntoAgentSkills({
      local: [],
      shared: [skill("meeting-prep")],
      enabled: new Set(),
    });
    assert.equal(merged.skills.length, 0);
    assert.equal(merged.sharedNames.size, 0);
  });

  it("never merges a store skill a local copy shadows", () => {
    const merged = mergeSharedIntoAgentSkills({
      local: [skill("Meeting-Prep")],
      shared: [skill("meeting-prep")],
      enabled: new Set(["meeting-prep"]),
    });
    assert.deepEqual(
      merged.skills.map((s) => s.name),
      ["Meeting-Prep"],
    );
    // The shadowing copy is the agent's OWN skill — it routes to the manage
    // dialog, so it must not be marked shared.
    assert.equal(merged.sharedNames.size, 0);
  });

  it("returns the local list untouched when the store is empty", () => {
    const local = [skill("a"), skill("b")];
    const merged = mergeSharedIntoAgentSkills({
      local,
      shared: [],
      enabled: new Set(["a"]),
    });
    assert.deepEqual(merged.skills, local);
    assert.equal(merged.sharedNames.size, 0);
  });
});

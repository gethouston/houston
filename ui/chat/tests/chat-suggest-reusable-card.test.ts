import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  type ChatSuggestReusableLabels,
  DEFAULT_SUGGEST_REUSABLE_LABELS,
  resolveSuggestReusableSaveLabel,
} from "../src/chat-suggest-reusable-card-model.ts";

const LABELS: ChatSuggestReusableLabels = {
  eyebrow: "Save this for next time",
  skillTitle: "Save as a Skill",
  routineTitle: "Save as a Routine",
  notNow: "Not now",
};

describe("resolveSuggestReusableSaveLabel", () => {
  it("uses the skill label for a skill suggestion", () => {
    assert.equal(
      resolveSuggestReusableSaveLabel("skill", LABELS),
      "Save as a Skill",
    );
  });

  it("uses the routine label for a routine suggestion", () => {
    assert.equal(
      resolveSuggestReusableSaveLabel("routine", LABELS),
      "Save as a Routine",
    );
  });
});

describe("DEFAULT_SUGGEST_REUSABLE_LABELS", () => {
  it("ships the English fallback copy with no em dashes", () => {
    assert.equal(DEFAULT_SUGGEST_REUSABLE_LABELS.skillTitle, "Save as a Skill");
    assert.equal(
      DEFAULT_SUGGEST_REUSABLE_LABELS.routineTitle,
      "Save as a Routine",
    );
    assert.equal(DEFAULT_SUGGEST_REUSABLE_LABELS.notNow, "Not now");
    for (const value of Object.values(DEFAULT_SUGGEST_REUSABLE_LABELS)) {
      assert.ok(!value.includes("—"), `"${value}" must not use an em dash`);
    }
  });
});

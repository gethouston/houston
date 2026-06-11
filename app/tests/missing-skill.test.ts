import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { MISSING_SKILL_KIND, isMissingSkillError } from "../src/lib/missing-skill.ts";

describe("missing-skill classifier (HOU-441)", () => {
  it("matches the stable engine error kind", () => {
    // Mirrors SkillError::NotFound -> kind "skill_not_found" in
    // engine/houston-engine-core/src/skills.rs.
    strictEqual(MISSING_SKILL_KIND, "skill_not_found");
  });

  it("recognizes a plain { kind } error body", () => {
    strictEqual(isMissingSkillError({ kind: "skill_not_found" }), true);
  });

  it("recognizes an error exposing kind via a getter (HoustonEngineError shape)", () => {
    const err = new Error("Skill not found: Redactar Outreach ESG");
    Object.defineProperty(err, "kind", { get: () => "skill_not_found" });
    strictEqual(isMissingSkillError(err), true);
  });

  it("does NOT match other engine error kinds (they still bug-toast + report)", () => {
    strictEqual(isMissingSkillError({ kind: "validation" }), false);
    strictEqual(isMissingSkillError({ kind: "rate_limited" }), false);
    strictEqual(isMissingSkillError({ kind: "parse_failed" }), false);
  });

  it("does NOT match untyped errors — a real crash must keep surfacing", () => {
    strictEqual(isMissingSkillError(new Error("boom")), false);
    strictEqual(isMissingSkillError("Skill not found"), false);
    strictEqual(isMissingSkillError(null), false);
    strictEqual(isMissingSkillError(undefined), false);
    strictEqual(isMissingSkillError({ message: "no kind here" }), false);
  });
});

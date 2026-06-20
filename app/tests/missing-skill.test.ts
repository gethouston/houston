import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { MISSING_SKILL_KIND, isMissingSkillError } from "../src/lib/missing-skill.ts";

describe("missing-skill classifier (HOU-515 / HOU-441)", () => {
  it("matches a 404 HoustonEngineError — the host's 'skill not found'", () => {
    // The TS host answers GET /v1/skills/<slug> with 404 when the directory is
    // gone; @houston-ai/engine-client surfaces it as a HoustonEngineError whose
    // `.status` is 404. The body is a bare string, so there is no typed `.kind`.
    strictEqual(isMissingSkillError({ status: 404, name: "HoustonEngineError" }), true);
  });

  it("tolerates a typed kind, should the host ever emit one", () => {
    strictEqual(MISSING_SKILL_KIND, "skill_not_found");
    strictEqual(isMissingSkillError({ kind: "skill_not_found" }), true);
  });

  it("does NOT match other engine statuses (they still bug-toast + report)", () => {
    strictEqual(isMissingSkillError({ status: 500 }), false);
    strictEqual(isMissingSkillError({ status: 401 }), false);
    strictEqual(isMissingSkillError({ status: 403 }), false);
    strictEqual(isMissingSkillError({ kind: "rate_limited" }), false);
  });

  it("does NOT match untyped errors — a real crash must keep surfacing", () => {
    strictEqual(isMissingSkillError(new Error("boom")), false);
    strictEqual(isMissingSkillError("skill not found"), false);
    strictEqual(isMissingSkillError(null), false);
    strictEqual(isMissingSkillError(undefined), false);
    strictEqual(isMissingSkillError({ message: "no status here" }), false);
  });
});

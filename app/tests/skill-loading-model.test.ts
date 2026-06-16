import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveLoadingSkillName } from "../src/components/tabs/skill-loading-model.ts";

describe("resolveLoadingSkillName", () => {
  it("returns null when no skill is selected", () => {
    strictEqual(resolveLoadingSkillName(null, true, false), null);
    strictEqual(resolveLoadingSkillName(null, false, false), null);
  });

  it("flags the selected skill while its first detail fetch is in flight", () => {
    strictEqual(resolveLoadingSkillName("research", true, false), "research");
  });

  it("clears once the detail resolves (fetch settled)", () => {
    strictEqual(resolveLoadingSkillName("research", false, true), null);
  });

  it("clears on a failed/settled fetch with no detail (toast path owns it)", () => {
    strictEqual(resolveLoadingSkillName("missing-skill", false, false), null);
  });

  it("does not re-flag a card during a background refetch of an open skill", () => {
    // Detail already on screen, React Query is revalidating: not a rage window.
    strictEqual(resolveLoadingSkillName("research", true, true), null);
  });
});

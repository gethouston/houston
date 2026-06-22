import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { canSaveName } from "../src/components/tabs/agent-settings-model.ts";

describe("agent settings model — canSaveName", () => {
  it("allows saving a changed, non-empty name", () => {
    strictEqual(canSaveName("Ada", "Grace"), true);
  });

  it("trims before comparing, so re-spacing the same name is a no-op", () => {
    strictEqual(canSaveName("Ada", "  Ada  "), false);
  });

  it("rejects an unchanged name", () => {
    strictEqual(canSaveName("Ada", "Ada"), false);
  });

  it("rejects an empty or whitespace-only name", () => {
    strictEqual(canSaveName("Ada", ""), false);
    strictEqual(canSaveName("Ada", "   "), false);
  });

  it("allows saving a trimmed variant that differs from current", () => {
    strictEqual(canSaveName("Ada", "  Grace  "), true);
  });
});

import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolvePermissionsFix } from "../src/components/integrations/blocked-ceiling.ts";

describe("resolvePermissionsFix", () => {
  const spy = () => {
    let agent = 0;
    return {
      openAgentDetail: () => {
        agent += 1;
      },
      count: () => agent,
    };
  };

  it("manager: returns this agent's drill-in deep link (policy is per agent only)", () => {
    const s = spy();
    const fix = resolvePermissionsFix({
      canManageAgent: true,
      openAgentDetail: s.openAgentDetail,
    });
    const thunk = fix("slack");
    strictEqual(typeof thunk, "function");
    thunk?.();
    strictEqual(s.count(), 1);
  });

  it("non-manager: no fix (member keeps ask-admin)", () => {
    const s = spy();
    const fix = resolvePermissionsFix({
      canManageAgent: false,
      openAgentDetail: s.openAgentDetail,
    });
    strictEqual(fix("slack"), undefined);
    strictEqual(s.count(), 0);
  });
});

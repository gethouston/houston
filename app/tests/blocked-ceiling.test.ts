import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  blockingCeiling,
  resolvePermissionsFix,
} from "../src/components/integrations/blocked-ceiling.ts";

describe("blockingCeiling", () => {
  it("org: outside the org ceiling wins even when also outside the agent set", () => {
    strictEqual(
      blockingCeiling("slack", {
        orgAllowedToolkits: ["gmail"],
        agentAllowedToolkits: ["gmail"],
      }),
      "org",
    );
  });

  it("agent: inside the org ceiling but not the agent ceiling", () => {
    strictEqual(
      blockingCeiling("slack", {
        orgAllowedToolkits: ["gmail", "slack"],
        agentAllowedToolkits: ["gmail"],
      }),
      "agent",
    );
  });

  it("agent: a null org ceiling is unrestricted, so it can never be the block", () => {
    strictEqual(
      blockingCeiling("slack", {
        orgAllowedToolkits: null,
        agentAllowedToolkits: ["gmail"],
      }),
      "agent",
    );
  });

  it("org: an empty org ceiling ([]) blocks everything at the org level", () => {
    strictEqual(
      blockingCeiling("slack", {
        orgAllowedToolkits: [],
        agentAllowedToolkits: null,
      }),
      "org",
    );
  });
});

describe("resolvePermissionsFix", () => {
  const spies = () => {
    let org = 0;
    let agent = 0;
    return {
      openOrgApps: () => {
        org += 1;
      },
      openAgentDetail: () => {
        agent += 1;
      },
      counts: () => ({ org, agent }),
    };
  };

  it("org block + owner: returns the org-apps deep link", () => {
    const s = spies();
    const fix = resolvePermissionsFix({
      orgAllowedToolkits: ["gmail"],
      agentAllowedToolkits: null,
      canEditOrg: true,
      canManageAgent: false,
      openOrgApps: s.openOrgApps,
      openAgentDetail: s.openAgentDetail,
    });
    const thunk = fix("slack");
    strictEqual(typeof thunk, "function");
    thunk?.();
    strictEqual(s.counts().org, 1);
    strictEqual(s.counts().agent, 0);
  });

  it("org block + non-owner: no fix (member keeps ask-admin)", () => {
    const s = spies();
    const fix = resolvePermissionsFix({
      orgAllowedToolkits: ["gmail"],
      agentAllowedToolkits: null,
      canEditOrg: false,
      canManageAgent: true,
      openOrgApps: s.openOrgApps,
      openAgentDetail: s.openAgentDetail,
    });
    strictEqual(fix("slack"), undefined);
  });

  it("agent block + manager: returns this agent's drill-in deep link", () => {
    const s = spies();
    const fix = resolvePermissionsFix({
      orgAllowedToolkits: ["gmail", "slack"],
      agentAllowedToolkits: ["gmail"],
      canEditOrg: false,
      canManageAgent: true,
      openOrgApps: s.openOrgApps,
      openAgentDetail: s.openAgentDetail,
    });
    const thunk = fix("slack");
    strictEqual(typeof thunk, "function");
    thunk?.();
    strictEqual(s.counts().agent, 1);
    strictEqual(s.counts().org, 0);
  });

  it("agent block + non-manager: no fix (member keeps ask-admin)", () => {
    const s = spies();
    const fix = resolvePermissionsFix({
      orgAllowedToolkits: null,
      agentAllowedToolkits: ["gmail"],
      canEditOrg: true,
      canManageAgent: false,
      openOrgApps: s.openOrgApps,
      openAgentDetail: s.openAgentDetail,
    });
    strictEqual(fix("slack"), undefined);
  });
});

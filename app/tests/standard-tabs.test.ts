import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities, OrgRole } from "@houston-ai/engine-client";
import {
  agentTabFallback,
  isVisibleAgentTab,
  STANDARD_TABS,
  visibleAgentTabs,
} from "../src/agents/standard-tabs.ts";

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: [],
  openaiCompatible: false,
  integrations: [],
  ...over,
});

const multiplayer = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, role });

const agent = (access?: "manager" | "user") => ({ access });

const ids = (caps: Capabilities | null, a: { access?: "manager" | "user" }) =>
  visibleAgentTabs(caps, a).map((tab) => tab.id);

describe("STANDARD_TABS order", () => {
  it("pins Agent Settings (job-description) to the far right, after archived", () => {
    deepStrictEqual(
      STANDARD_TABS.map((tab) => tab.id),
      [
        "activity",
        "routines",
        "integrations",
        "files",
        "archived",
        "job-description",
      ],
    );
  });
});

describe("visibleAgentTabs", () => {
  it("shows Agent Settings in single-player (the sole user owns everything)", () => {
    for (const access of ["manager", "user", undefined] as const) {
      strictEqual(ids(caps(), agent(access)).includes("job-description"), true);
      strictEqual(ids(null, agent(access)).includes("job-description"), true);
    }
  });

  it("shows Agent Settings to the org owner and per-agent managers", () => {
    strictEqual(
      ids(multiplayer("owner"), agent("user")).includes("job-description"),
      true,
    );
    for (const role of ["admin", "user"] as const) {
      strictEqual(
        ids(multiplayer(role), agent("manager")).includes("job-description"),
        true,
      );
    }
  });

  it("hides Agent Settings from a plain org member", () => {
    for (const role of ["admin", "user"] as const) {
      strictEqual(
        ids(multiplayer(role), agent("user")).includes("job-description"),
        false,
      );
      strictEqual(
        ids(multiplayer(role), agent(undefined)).includes("job-description"),
        false,
      );
    }
  });

  it("always shows the five use-tabs regardless of role", () => {
    const use = ["activity", "routines", "integrations", "files", "archived"];
    deepStrictEqual(ids(multiplayer("user"), agent("user")), use);
  });
});

describe("visibleAgentTabs — event triggers add no tab (merged Automations)", () => {
  it("shows the same tab set with and without the triggers capability", () => {
    // The wake mechanism is a choice inside the Automations editor, gated by
    // `capabilities.triggers` there — never a separate tab, so the tab set is
    // byte-identical across deployments.
    deepStrictEqual(
      ids(caps({ triggers: true }), agent()),
      ids(caps(), agent()),
    );
    deepStrictEqual(
      ids(caps({ triggers: false }), agent()),
      ids(null, agent()),
    );
  });

  it("never contains a reactions tab", () => {
    for (const c of [caps(), null, caps({ triggers: true })]) {
      strictEqual(ids(c, agent()).includes("reactions"), false);
    }
  });
});

describe("agentTabFallback / isVisibleAgentTab", () => {
  it("keeps a member on a visible use-tab", () => {
    strictEqual(
      agentTabFallback(multiplayer("user"), agent("user"), "files"),
      "files",
    );
    strictEqual(
      isVisibleAgentTab(multiplayer("user"), agent("user"), "files"),
      true,
    );
  });

  it("redirects a member off the hidden Agent Settings tab", () => {
    // job-description is in STANDARD_TAB_IDS but hidden from a plain member;
    // it must resolve to the default tab, not strand them on a blank pane.
    strictEqual(
      isVisibleAgentTab(multiplayer("user"), agent("user"), "job-description"),
      false,
    );
    strictEqual(
      agentTabFallback(multiplayer("user"), agent("user"), "job-description"),
      "activity",
    );
  });

  it("keeps managers and single-player on Agent Settings", () => {
    strictEqual(
      agentTabFallback(
        multiplayer("user"),
        agent("manager"),
        "job-description",
      ),
      "job-description",
    );
    strictEqual(
      agentTabFallback(caps(), agent(undefined), "job-description"),
      "job-description",
    );
  });
});

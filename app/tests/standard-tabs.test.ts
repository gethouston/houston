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

const teams = (role: OrgRole): Capabilities =>
  caps({ multiplayer: true, teams: true, role });

const agent = (access?: "manager" | "user") => ({ access });

const ids = (caps: Capabilities | null, a: { access?: "manager" | "user" }) =>
  visibleAgentTabs(caps, a).map((tab) => tab.id);

describe("STANDARD_TABS order", () => {
  it("pins the seven agent tabs in product order (PRODUCT-1256)", () => {
    deepStrictEqual(
      STANDARD_TABS.map((tab) => tab.id),
      [
        "activity",
        "context",
        "skills",
        "integrations",
        "routines",
        "files",
        "admin",
      ],
    );
  });
});

describe("visibleAgentTabs — single-player", () => {
  it("shows Context and Skills; the sole user owns everything", () => {
    for (const access of ["manager", "user", undefined] as const) {
      for (const c of [caps(), null]) {
        strictEqual(ids(c, agent(access)).includes("context"), true);
        strictEqual(ids(c, agent(access)).includes("skills"), true);
      }
    }
  });

  it("hides Admin: there are no access rows to administer", () => {
    for (const c of [caps(), null]) {
      strictEqual(ids(c, agent()).includes("admin"), false);
    }
  });
});

describe("visibleAgentTabs — multiplayer without Teams", () => {
  it("shows Context, Skills, and Admin to the org owner and agent managers", () => {
    for (const [c, a] of [
      [multiplayer("owner"), agent("user")],
      [multiplayer("admin"), agent("manager")],
      [multiplayer("user"), agent("manager")],
    ] as const) {
      strictEqual(ids(c, a).includes("context"), true);
      strictEqual(ids(c, a).includes("skills"), true);
      strictEqual(ids(c, a).includes("admin"), true);
    }
  });

  it("hides all three from a plain member", () => {
    for (const role of ["admin", "user"] as const) {
      for (const a of [agent("user"), agent(undefined)]) {
        strictEqual(ids(multiplayer(role), a).includes("context"), false);
        strictEqual(ids(multiplayer(role), a).includes("skills"), false);
        strictEqual(ids(multiplayer(role), a).includes("admin"), false);
      }
    }
  });

  it("always shows the four use-tabs regardless of role", () => {
    deepStrictEqual(ids(multiplayer("user"), agent("user")), [
      "activity",
      "integrations",
      "routines",
      "files",
    ]);
  });
});

describe("visibleAgentTabs — Teams", () => {
  it("shows Context to every role (members read it read-only)", () => {
    for (const role of ["owner", "admin", "user"] as const) {
      for (const access of ["manager", "user", undefined] as const) {
        strictEqual(ids(teams(role), agent(access)).includes("context"), true);
      }
    }
  });

  it("keeps Skills and Admin manager-only, per PRODUCT-1256", () => {
    for (const role of ["admin", "user"] as const) {
      strictEqual(ids(teams(role), agent("user")).includes("skills"), false);
      strictEqual(ids(teams(role), agent("user")).includes("admin"), false);
    }
    strictEqual(ids(teams("owner"), agent("user")).includes("skills"), true);
    strictEqual(ids(teams("owner"), agent("user")).includes("admin"), true);
    strictEqual(ids(teams("user"), agent("manager")).includes("skills"), true);
    strictEqual(ids(teams("user"), agent("manager")).includes("admin"), true);
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

  it("redirects a member off the hidden manager tabs", () => {
    // context/skills/admin are in STANDARD_TAB_IDS but hidden from a plain
    // member; they must resolve to the default tab, not strand them on a
    // blank pane.
    for (const id of ["context", "skills", "admin"]) {
      strictEqual(
        isVisibleAgentTab(multiplayer("user"), agent("user"), id),
        false,
      );
      strictEqual(
        agentTabFallback(multiplayer("user"), agent("user"), id),
        "activity",
      );
    }
  });

  it("redirects the retired job-description id to the default tab", () => {
    strictEqual(
      agentTabFallback(caps(), agent(undefined), "job-description"),
      "activity",
    );
  });

  it("keeps a Teams member on Context for read-only access", () => {
    strictEqual(
      agentTabFallback(teams("user"), agent("user"), "context"),
      "context",
    );
  });

  it("keeps managers and single-player on the manager tabs", () => {
    for (const id of ["context", "skills", "admin"]) {
      strictEqual(
        agentTabFallback(multiplayer("user"), agent("manager"), id),
        id,
      );
    }
    for (const id of ["context", "skills"]) {
      strictEqual(agentTabFallback(caps(), agent(undefined), id), id);
    }
  });
});

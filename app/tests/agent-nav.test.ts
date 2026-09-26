import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston/engine-adapter";
import {
  agentDestination,
  canOpenAgentSettings,
  workingAgentId,
} from "../src/lib/agent-nav.ts";
import type { Agent } from "../src/lib/types.ts";

describe("agentDestination on the desktop", () => {
  it("opens the employee's own board", () => {
    deepStrictEqual(agentDestination("a1", "board", false), {
      kind: "agent-view",
      agentId: "a1",
      section: "mission-control",
    });
  });

  it("opens that employee's routines and files", () => {
    deepStrictEqual(agentDestination("a2", "routines", false), {
      kind: "agent-view",
      agentId: "a2",
      section: "routines",
    });
    deepStrictEqual(agentDestination("a2", "files", false), {
      kind: "agent-view",
      agentId: "a2",
      section: "files",
    });
  });

  it("opens that employee's settings", () => {
    deepStrictEqual(agentDestination("a1", "settings", false), {
      kind: "agent-view",
      agentId: "a1",
      section: "settings",
    });
  });
});

describe("agentDestination on the phone", () => {
  it("opens the employee's ONE task list, the AI Employees drill-in", () => {
    deepStrictEqual(agentDestination("a1", "board", true), {
      kind: "task-list",
      agentId: "a1",
    });
  });

  it("opens settings in place over that task list", () => {
    deepStrictEqual(agentDestination("a1", "settings", true), {
      kind: "task-list",
      agentId: "a1",
    });
  });

  it("keeps routines and files on the employee's own screen", () => {
    deepStrictEqual(agentDestination("a2", "routines", true), {
      kind: "agent-view",
      agentId: "a2",
      section: "routines",
    });
    deepStrictEqual(agentDestination("a2", "files", true), {
      kind: "agent-view",
      agentId: "a2",
      section: "files",
    });
  });
});

describe("canOpenAgentSettings", () => {
  const caps = (role: string) =>
    ({ multiplayer: true, role }) as unknown as Parameters<
      typeof canOpenAgentSettings
    >[0];
  /** Only `access` matters here — it is what the gate reads. */
  const managed = { access: "manager" } as const;
  const used = { access: "user" } as const;
  /** Single-player wire rows carry no access field at all. */
  const bare = {} as { access?: "manager" | "user" };

  it("is open to a single-player user (the solo owner of every team)", () => {
    strictEqual(canOpenAgentSettings(null, bare), true);
    strictEqual(canOpenAgentSettings(undefined, bare), true);
  });

  it("uses the effective per-agent manager gate for every org role", () => {
    strictEqual(canOpenAgentSettings(caps("owner"), used), true);
    strictEqual(canOpenAgentSettings(caps("admin"), managed), true);
    strictEqual(canOpenAgentSettings(caps("admin"), used), false);
  });

  it("is open to a member who MANAGES the agent, and closed when they only use it", () => {
    // An employee's Settings section is a per-agent door, so the page's gate
    // is per agent: a member who manages this agent reaches it, a member who
    // only uses it does not (the affordance would resolve back to Mission
    // Control).
    strictEqual(canOpenAgentSettings(caps("user"), managed), true);
    strictEqual(canOpenAgentSettings(caps("user"), used), false);
    strictEqual(canOpenAgentSettings(caps("user"), bare), false);
  });
});

// A nav that names no employee (the tour's "Click New task" step, New task
// from the palette or the AI Models hub, a lesson beat, a hands-on errand)
// works on the current employee, else the first one the rail shows: the
// Agents home has no New task button, and a spotlight would find nothing
// there.
describe("workingAgentId", () => {
  const agent = (id: string) => ({ id, name: id }) as Agent;
  const roster = [agent("a"), agent("b"), agent("c")];
  const layout: SidebarLayout = {
    groups: [{ id: "g", name: "g", collapsed: false, agentIds: ["c", "a"] }],
    order: [
      { kind: "group", id: "g" },
      { kind: "agent", id: "b" },
    ],
  };

  it("keeps the current employee", () => {
    strictEqual(workingAgentId("b", roster, layout), "b");
  });

  it("falls back to the first employee in sidebar order, not roster order", () => {
    strictEqual(workingAgentId(null, roster, layout), "c");
    strictEqual(workingAgentId("deleted", roster, layout), "c");
  });

  it("has no employee to open for an empty roster", () => {
    strictEqual(workingAgentId(null, [], layout), null);
  });
});

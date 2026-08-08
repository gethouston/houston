import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  agentDestination,
  canOpenAgentSettings,
} from "../src/lib/agent-nav.ts";
import { DEFAULT_TEAM_ID, type TeamView } from "../src/lib/teams-model.ts";

// The per-agent tab shell is gone: every "take me to agent X's <thing>" now
// resolves to a section of X's TEAM. These are the rules every caller shares —
// notification clicks, @mention rows, the command palette, turn summaries.

function agent(id: string) {
  return {
    id,
    name: id,
    configId: "c",
    folderPath: `/w/${id}`,
  } as unknown as TeamView["agents"][number];
}

const teams: TeamView[] = [
  { id: "grp-ops", name: "Ops", agents: [agent("a1")], isDefault: false },
  {
    id: DEFAULT_TEAM_ID,
    name: "My workspace",
    agents: [agent("a2")],
    isDefault: true,
  },
];

describe("agentDestination", () => {
  it("opens the agent's own team, pinned to the agent, for its board", () => {
    deepStrictEqual(agentDestination(teams, "a1", "board"), {
      view: "team",
      teamId: "grp-ops",
      section: "mission-control",
      agentFilter: "a1",
    });
  });

  it("keeps the pin for the sections that narrow by it", () => {
    deepStrictEqual(agentDestination(teams, "a2", "routines"), {
      view: "team",
      teamId: DEFAULT_TEAM_ID,
      section: "routines",
      agentFilter: "a2",
    });
    deepStrictEqual(agentDestination(teams, "a2", "files"), {
      view: "team",
      teamId: DEFAULT_TEAM_ID,
      section: "files",
      agentFilter: "a2",
    });
  });

  it("drops the pin for Team Settings, which lists the whole team", () => {
    deepStrictEqual(agentDestination(teams, "a1", "settings"), {
      view: "team",
      teamId: "grp-ops",
      section: "settings",
      agentFilter: null,
    });
  });

  it("falls back to the cross-agent board when no team claims the agent", () => {
    // No workspace resolved yet -> no teams at all. Mission Control still holds
    // every agent's missions, so a mission nav lands somewhere real.
    deepStrictEqual(agentDestination([], "a1", "board"), {
      view: "dashboard",
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

  it("is open to the org owner/admin for any agent (they own every team)", () => {
    for (const agent of [managed, used, bare]) {
      strictEqual(canOpenAgentSettings(caps("owner"), agent), true);
      strictEqual(canOpenAgentSettings(caps("admin"), agent), true);
    }
  });

  it("is open to a member who MANAGES the agent, and closed when they only use it", () => {
    // Team Settings is a PER-TEAM door now, so the page's gate is per agent: a
    // member who manages this agent reaches it, a member who only uses it does
    // not (the affordance would resolve back to Mission Control).
    strictEqual(canOpenAgentSettings(caps("user"), managed), true);
    strictEqual(canOpenAgentSettings(caps("user"), used), false);
    strictEqual(canOpenAgentSettings(caps("user"), bare), false);
  });
});

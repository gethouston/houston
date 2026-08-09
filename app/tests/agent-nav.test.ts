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

  it("answers `none` when no team claims the agent", () => {
    // No workspace resolved yet -> no teams at all. There is no global board to
    // substitute any more, so the rule STATES the miss and leaves the landing
    // to the caller: a board request goes home, a settings request refuses.
    for (const target of ["board", "routines", "files", "settings"] as const) {
      deepStrictEqual(agentDestination([], "a1", target), { view: "none" });
    }
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

  /** A server team holding exactly one agent this caller only USES. */
  const serverTeam = (owner: boolean): TeamView => ({
    id: "s1",
    name: "Sales",
    agents: [{ ...agent("a1"), access: "user" }],
    isDefault: false,
    server: { joined: true, owner, memberCount: 3, sortOrder: 0 },
  });

  it("with a team in hand it asks THAT team's question, so a server team owner gets in", () => {
    // On a server-teams host an explicit team owner configures the team's
    // agents without being an org admin, even though they manage NOTHING and
    // their org role is a plain `user`. Only the per-team gate knows that, so
    // a caller that drops the team argument hides the affordance from them.
    strictEqual(
      canOpenAgentSettings(caps("user"), used, serverTeam(true)),
      true,
    );
    strictEqual(canOpenAgentSettings(caps("user"), used), false);
  });

  it("closes for a plain member of a team they do not own and manage nothing in", () => {
    // The mirror of the case above: same caller, same agent, `owner: false`
    // and no managed agent anywhere in the team -> no Settings section, so no
    // configure affordance.
    strictEqual(
      canOpenAgentSettings(caps("user"), used, serverTeam(false)),
      false,
    );
  });

  it("a passed team can also CLOSE the door the org-wide answer left open", () => {
    strictEqual(
      canOpenAgentSettings(caps("admin"), used, serverTeam(false)),
      false,
    );
  });

  it("null/undefined for the team falls back to the org-wide answer", () => {
    strictEqual(canOpenAgentSettings(caps("user"), managed, null), true);
    strictEqual(canOpenAgentSettings(caps("user"), used, undefined), false);
    strictEqual(canOpenAgentSettings(caps("owner"), used, null), true);
  });

  it("a LOCAL team (no server facts) answers exactly as the org-wide gate", () => {
    // The capability-off path must stay byte-identical.
    const local: TeamView = {
      id: "grp-ops",
      name: "Ops",
      agents: [],
      isDefault: false,
    };
    strictEqual(canOpenAgentSettings(caps("user"), used, local), false);
    strictEqual(canOpenAgentSettings(caps("owner"), used, local), true);
    strictEqual(canOpenAgentSettings(caps("admin"), used, local), true);
  });
});

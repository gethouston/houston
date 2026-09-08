import { describe, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import {
  agentDirectory,
  isAddressableAgent,
  matchAgentRefs,
  qualifiedAgentName,
  reachableAgents,
} from "./reachable-agents";

const workspace = (
  id: string,
  name: string,
  ownerUserId = "u1",
): Workspace => ({
  id,
  ownerUserId,
  kind: "personal",
  name,
  slug: name.toLowerCase(),
  runtime: "local",
  createdAt: 0,
});

const agent = (id: string, workspaceId: string, name: string): Agent => ({
  id,
  workspaceId,
  name,
  createdAt: 0,
});

const HOME = workspace("ws-home", "Home");
const WORK = workspace("ws-work", "Work");
const OTHERS = workspace("ws-other", "Other", "u2");

const AGENTS: Record<string, Agent[]> = {
  "ws-home": [
    agent("a-legal", "ws-home", "Legal"),
    agent("a-assistant", "ws-home", ".assistant"),
  ],
  "ws-work": [agent("a-marketing", "ws-work", "Marketing")],
  "ws-other": [agent("a-secret", "ws-other", "Secret")],
};

/** Only the two calls this helper makes; everything else is a wiring bug here. */
const store = (workspaces: Workspace[]): WorkspaceStore =>
  ({
    listWorkspacesForUser: async (userId: string) =>
      workspaces.filter((w) => w.ownerUserId === userId),
    listAgents: async (workspaceId: string) => AGENTS[workspaceId] ?? [],
  }) as unknown as WorkspaceStore;

describe("reachableAgents", () => {
  test("lists the owner's workspaces, its own first, and never another user's", async () => {
    const found = await reachableAgents(store([HOME, WORK, OTHERS]), WORK);
    expect(found.map((r) => `${r.workspace.name}/${r.agent.name}`)).toEqual([
      "Work/Marketing",
      "Home/Legal",
    ]);
  });

  test("withholds Houston's own dot-named agents", async () => {
    const found = await reachableAgents(store([HOME]), HOME);
    expect(found.map((r) => r.agent.name)).toEqual(["Legal"]);
    expect(isAddressableAgent(agent("x", "ws-home", ".setup"))).toBe(false);
  });
});

describe("matchAgentRefs", () => {
  const reachable = [
    { workspace: HOME, agent: agent("a-legal", "ws-home", "Legal") },
    { workspace: HOME, agent: agent("a-mkt", "ws-home", "Marketing") },
    { workspace: WORK, agent: agent("a-mkt-2", "ws-work", "Marketing") },
  ];

  const idsOf = (refs: { agent: Agent }[]) => refs.map((r) => r.agent.id);

  test("an id resolves alone, even when a name would also match", () => {
    expect(idsOf(matchAgentRefs(reachable, "a-mkt-2"))).toEqual(["a-mkt-2"]);
    expect(idsOf(matchAgentRefs(reachable, " a-legal "))).toEqual(["a-legal"]);
  });

  test("a bare name matches every workspace that uses it", () => {
    expect(
      matchAgentRefs(reachable, "marketing").map((r) => r.agent.id),
    ).toEqual(["a-mkt", "a-mkt-2"]);
  });

  test("a qualified name matches by workspace name or workspace id", () => {
    expect(idsOf(matchAgentRefs(reachable, "Work/Marketing"))).toEqual([
      "a-mkt-2",
    ]);
    expect(idsOf(matchAgentRefs(reachable, "ws-work/marketing"))).toEqual([
      "a-mkt-2",
    ]);
  });

  test("nothing matches an agent that is not there", () => {
    expect(matchAgentRefs(reachable, "Sales")).toEqual([]);
  });

  test("spells a qualified name and a directory the reader can pick from", () => {
    const last = reachable[reachable.length - 1];
    if (!last) throw new Error("expected a reachable agent");
    expect(qualifiedAgentName(last)).toBe("Work/Marketing");
    expect(agentDirectory(reachable)).toBe(
      "Legal (id a-legal, in Home), Marketing (id a-mkt, in Home), Marketing (id a-mkt-2, in Work)",
    );
  });
});

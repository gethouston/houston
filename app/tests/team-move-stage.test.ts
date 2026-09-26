import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston/engine-adapter";
import type { PendingTeamMove } from "../src/lib/pending-team-move.ts";
import {
  runTeamMovePostscript,
  runTeamMoveStage,
  sourceAfterFolderMove,
  type TeamMoveStageWire,
  targetFolderLayout,
} from "../src/lib/team-move-stage.ts";

const TARGET = { slug: "abcdef0123456789", name: "Acme" };
const PENDING: PendingTeamMove = {
  sourceTeam: {
    id: "old",
    workspaceId: "default",
    name: "Design",
    icon: "palette",
    color: "blue",
  },
  targetSlug: TARGET.slug,
  targetName: TARGET.name,
  targetGroupId: "new-folder",
  agentIds: ["a", "b"],
  movedAgentIds: ["a", "b"],
  startedAt: 1,
};
const group = (id: string, agentIds: string[]) => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
});
const source: SidebarLayout = {
  groups: [group("old", ["a", "b"]), group("keep", ["c"])],
  order: [
    { kind: "agent", id: "d" },
    { kind: "group", id: "old" },
    { kind: "group", id: "keep" },
  ],
};
const target: SidebarLayout = {
  groups: [group("there", ["x"])],
  order: [
    { kind: "agent", id: "y" },
    { kind: "group", id: "there" },
  ],
};

function wire(fail?: string) {
  const calls: string[] = [];
  const layouts = new Map([
    ["default", source],
    ["org:abcdef0123456789", target],
  ]);
  const run = (name: string) => {
    calls.push(name);
    if (name === fail) throw new Error(name);
  };
  const value: TeamMoveStageWire = {
    targetWorkspaceId: async () => {
      run("resolveTarget");
      return "org:abcdef0123456789";
    },
    getLayout: async (id) => {
      run(`get:${id}`);
      const layout = layouts.get(id);
      if (!layout) throw new Error("layout missing");
      return layout;
    },
    updateLayout: async (id, op) => {
      run(`set:${id}`);
      const current = layouts.get(id);
      if (!current) throw new Error("layout missing");
      const layout = op(current);
      layouts.set(id, layout);
      return layout;
    },
    switchTarget: async () => run("switching"),
  };
  return { value, calls, layouts };
}

describe("folder move stages", () => {
  it("creates a folder with identity and moved agents without changing other folders", () => {
    const next = targetFolderLayout(target, PENDING);
    deepStrictEqual(next.groups, [
      group("there", ["x"]),
      {
        id: "new-folder",
        name: "Design",
        collapsed: false,
        agentIds: ["a", "b"],
        icon: "palette",
        color: "blue",
      },
    ]);
    deepStrictEqual(next.order, [
      { kind: "group", id: "new-folder" },
      ...target.order,
    ]);
  });

  it("is idempotent when destination setup resumes after a stored write", () => {
    const once = targetFolderLayout(target, PENDING);
    deepStrictEqual(targetFolderLayout(once, PENDING), once);
  });

  it("removes the source folder and moved agent ids while preserving neighbors", () => {
    deepStrictEqual(sourceAfterFolderMove(source, PENDING), {
      groups: [group("keep", ["c"])],
      order: [
        { kind: "agent", id: "d" },
        { kind: "group", id: "keep" },
      ],
    });
    deepStrictEqual(
      sourceAfterFolderMove(sourceAfterFolderMove(source, PENDING), PENDING),
      sourceAfterFolderMove(source, PENDING),
    );
  });

  it("leaves an agent added during the move in No team", () => {
    const changed = {
      ...source,
      groups: [
        { ...source.groups[0], agentIds: ["a", "b", "new"] },
        source.groups[1],
      ],
    };
    deepStrictEqual(sourceAfterFolderMove(changed, PENDING).order, [
      { kind: "agent", id: "d" },
      { kind: "agent", id: "new" },
      { kind: "group", id: "keep" },
    ]);
  });

  it("runs destination setup, source cleanup and space switch in order", async () => {
    const target = wire();
    const states: string[] = [];
    await runTeamMovePostscript(
      PENDING,
      target.value,
      (state) => void states.push(state.step),
    );
    deepStrictEqual(target.calls, [
      "resolveTarget",
      "get:org:abcdef0123456789",
      "set:org:abcdef0123456789",
      "get:default",
      "set:default",
      "switching",
    ]);
    strictEqual(states.at(-1), "invite");
    deepStrictEqual(
      target.layouts.get("default")?.groups.map((item) => item.id),
      ["keep"],
    );
  });

  it("resumes from a stored stage without repeating completed writes", async () => {
    const target = wire();
    await runTeamMovePostscript(
      { ...PENDING, postscriptStage: "cleanupSource" },
      target.value,
      () => {},
    );
    deepStrictEqual(target.calls, ["get:default", "set:default", "switching"]);
  });

  for (const [step, failure] of [
    ["createTarget", "set:org:abcdef0123456789"],
    ["cleanupSource", "set:default"],
    ["switching", "switching"],
  ] as const) {
    it(`rejects during ${step} so resume retries that stage`, async () => {
      await rejects(() =>
        runTeamMoveStage(
          { step, target: TARGET },
          PENDING,
          wire(failure).value,
        ),
      );
    });
  }
});

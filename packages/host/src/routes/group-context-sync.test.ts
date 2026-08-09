import type { HoustonEvent, SidebarLayout } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import type { EventHub } from "../events/hub";
import { LocalPaths } from "../paths";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import {
  diffContextByAgent,
  resolveContextByAgent,
  syncGroupContextFiles,
} from "./group-context-sync";

const layout = (
  groups: SidebarLayout["groups"],
  over: Partial<SidebarLayout> = {},
): SidebarLayout => ({
  groups,
  ungroupedOrder: [],
  ...over,
});

const group = (
  id: string,
  agentIds: string[],
  context?: string,
): SidebarLayout["groups"][number] => ({
  id,
  name: id,
  collapsed: false,
  agentIds,
  ...(context !== undefined ? { context } : {}),
});

describe("resolveContextByAgent", () => {
  test("maps each member of a group with context to the trimmed context", () => {
    const map = resolveContextByAgent(
      layout([group("g1", ["a1", "a2"], "  be terse  ")]),
      [],
    );
    expect([...map]).toEqual([
      ["a1", "be terse"],
      ["a2", "be terse"],
    ]);
  });

  test("a blank or whitespace-only context contributes nothing", () => {
    const map = resolveContextByAgent(
      layout([group("g1", ["a1"], "   "), group("g2", ["a2"], "")]),
      [],
    );
    expect(map.size).toBe(0);
  });

  test("a group without a context field contributes nothing", () => {
    const map = resolveContextByAgent(layout([group("g1", ["a1"])]), []);
    expect(map.has("a1")).toBe(false);
  });

  test("an agent in two groups with context: last in array order wins", () => {
    const map = resolveContextByAgent(
      layout([group("g1", ["a1"], "first"), group("g2", ["a1"], "second")]),
      [],
    );
    expect(map.get("a1")).toBe("second");
  });
});

describe("resolveContextByAgent — the DEFAULT team", () => {
  test("every UNGROUPED agent inherits the default context", () => {
    const map = resolveContextByAgent(
      layout([group("g1", ["a1"])], { defaultContext: "  we ship daily  " }),
      ["a1", "a2", "a3"],
    );
    // a1 is in a named team (which has no context of its own) and so is NOT in
    // the default team: it inherits nothing.
    expect([...map]).toEqual([
      ["a2", "we ship daily"],
      ["a3", "we ship daily"],
    ]);
  });

  test("an agent the layout has never seen still counts as ungrouped", () => {
    // The roster, not `ungroupedOrder`, decides membership: a brand-new agent
    // nobody has dragged appears in neither list, and the rail shows it in the
    // default team, so the mirror must agree.
    const map = resolveContextByAgent(
      layout([], { defaultContext: "ctx", ungroupedOrder: ["a1"] }),
      ["a1", "a2"],
    );
    expect([...map.keys()].sort()).toEqual(["a1", "a2"]);
  });

  test("a named team's own context wins over the default for its members", () => {
    const map = resolveContextByAgent(
      layout([group("g1", ["a1"], "team text")], { defaultContext: "default" }),
      ["a1", "a2"],
    );
    expect(map.get("a1")).toBe("team text");
    expect(map.get("a2")).toBe("default");
  });

  test("a blank default context contributes nothing", () => {
    const map = resolveContextByAgent(layout([], { defaultContext: "  " }), [
      "a1",
    ]);
    expect(map.size).toBe(0);
  });

  test("an absent default context contributes nothing", () => {
    expect(resolveContextByAgent(layout([]), ["a1"]).size).toBe(0);
  });
});

describe("diffContextByAgent", () => {
  test("agent added to a group with context is reported changed", () => {
    const prev = layout([group("g1", [], "ctx")]);
    const next = layout([group("g1", ["a1"], "ctx")]);
    expect(diffContextByAgent(prev, next, ["a1"])).toEqual(["a1"]);
  });

  test("editing a group's context text reports its members changed", () => {
    const prev = layout([group("g1", ["a1", "a2"], "old")]);
    const next = layout([group("g1", ["a1", "a2"], "new")]);
    expect(diffContextByAgent(prev, next, ["a1", "a2"]).sort()).toEqual([
      "a1",
      "a2",
    ]);
  });

  test("clearing a group's context reports its former members changed", () => {
    const prev = layout([group("g1", ["a1"], "ctx")]);
    const next = layout([group("g1", ["a1"], "")]);
    expect(diffContextByAgent(prev, next, ["a1"])).toEqual(["a1"]);
  });

  test("deleting the group entirely removes its members' context", () => {
    const prev = layout([group("g1", ["a1"], "ctx")]);
    const next = layout([]);
    expect(diffContextByAgent(prev, next, ["a1"])).toEqual(["a1"]);
  });

  test("removing an agent from the group reports it changed", () => {
    const prev = layout([group("g1", ["a1", "a2"], "ctx")]);
    const next = layout([group("g1", ["a1"], "ctx")]);
    expect(diffContextByAgent(prev, next, ["a1", "a2"])).toEqual(["a2"]);
  });

  test("no context change (only order/name churn) reports nothing", () => {
    const prev = layout([group("g1", ["a1", "a2"], "ctx")]);
    const next = layout([group("g1", ["a2", "a1"], "ctx")]);
    expect(diffContextByAgent(prev, next, ["a1", "a2"])).toEqual([]);
  });

  test("an unchanged member keeps its context and is not reported", () => {
    const prev = layout([group("g1", ["a1", "a2"], "ctx")]);
    const next = layout([
      group("g1", ["a1", "a2"], "ctx"),
      group("g2", ["a3"], "other"),
    ]);
    expect(diffContextByAgent(prev, next, ["a1", "a2", "a3"])).toEqual(["a3"]);
  });

  test("writing a default context reports every ungrouped agent", () => {
    const prev = layout([group("g1", ["a1"], "ctx")]);
    const next = layout([group("g1", ["a1"], "ctx")], {
      defaultContext: "everyone else",
    });
    expect(diffContextByAgent(prev, next, ["a1", "a2", "a3"]).sort()).toEqual([
      "a2",
      "a3",
    ]);
  });

  test("clearing the default context reports every ungrouped agent", () => {
    const prev = layout([], { defaultContext: "ctx" });
    const next = layout([], { defaultContext: "" });
    expect(diffContextByAgent(prev, next, ["a1", "a2"]).sort()).toEqual([
      "a1",
      "a2",
    ]);
  });

  test("moving an agent OUT of a named team into the default one", () => {
    const prev = layout([group("g1", ["a1"], "team text")], {
      defaultContext: "default text",
    });
    const next = layout([group("g1", [], "team text")], {
      defaultContext: "default text",
    });
    expect(diffContextByAgent(prev, next, ["a1"])).toEqual(["a1"]);
    expect(resolveContextByAgent(next, ["a1"]).get("a1")).toBe("default text");
  });

  test("moving an agent INTO a named team out of the default one", () => {
    const prev = layout([group("g1", [], "team text")], {
      defaultContext: "default text",
    });
    const next = layout([group("g1", ["a1"], "team text")], {
      defaultContext: "default text",
    });
    expect(diffContextByAgent(prev, next, ["a1"])).toEqual(["a1"]);
    expect(resolveContextByAgent(next, ["a1"]).get("a1")).toBe("team text");
  });

  test("moving into a CONTEXT-LESS team drops the default context", () => {
    const prev = layout([group("g1", [])], { defaultContext: "default text" });
    const next = layout([group("g1", ["a1"])], {
      defaultContext: "default text",
    });
    expect(diffContextByAgent(prev, next, ["a1"])).toEqual(["a1"]);
    expect(resolveContextByAgent(next, ["a1"]).has("a1")).toBe(false);
  });
});

/** A workspace with `names.length` agents, plus the deps slice the sync needs.
 *  `ids[i]` and `groupMd(i)` address the same agent, so a test reads back the
 *  mirror of the agent it just placed. */
async function harness(names: string[]) {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("u1");
  const ids: string[] = [];
  for (const name of names)
    ids.push((await store.createAgent({ workspaceId: ws.id, name })).id);

  const emitted: HoustonEvent[] = [];
  const events: EventHub = {
    emit: (_userId, event) => {
      emitted.push(event);
    },
    subscribe: () => () => {},
  };
  // The roster read is the cost the sync's pre-check exists to avoid, so count
  // it: a plain drag must not pay for it.
  let listCalls = 0;
  const listAgents = store.listAgents.bind(store);
  store.listAgents = (id) => {
    listCalls += 1;
    return listAgents(id);
  };

  return {
    ws,
    deps: { store, vfs, paths: new LocalPaths(), events },
    emitted,
    ids,
    id: (index: number) => ids[index] ?? "",
    groupMd: (index: number) => vfs.readText(`${ids[index]}/GROUP.md`),
    listCalls: () => listCalls,
  };
}

describe("syncGroupContextFiles — the default team fans out like a named one", () => {
  test("writes GROUP.md for every ungrouped agent, and only those", async () => {
    const h = await harness(["Ana", "Bo", "Cy"]);
    const next = layout([group("g1", [h.id(0)], "team text")], {
      defaultContext: "we ship daily",
    });
    await syncGroupContextFiles(h.deps, h.ws, layout([]), next);
    expect(await h.groupMd(0)).toBe("team text");
    expect(await h.groupMd(1)).toBe("we ship daily");
    expect(await h.groupMd(2)).toBe("we ship daily");
    expect(h.emitted).toHaveLength(3);
    expect(h.emitted.every((e) => e.type === "ContextChanged")).toBe(true);
  });

  test("an agent moved out of a named team gets the DEFAULT text in the SAME file", async () => {
    const h = await harness(["Ana"]);
    const prev = layout([group("g1", [h.id(0)], "team text")], {
      defaultContext: "default text",
    });
    await syncGroupContextFiles(h.deps, h.ws, layout([]), prev);
    expect(await h.groupMd(0)).toBe("team text");

    const next = layout([group("g1", [], "team text")], {
      defaultContext: "default text",
    });
    await syncGroupContextFiles(h.deps, h.ws, prev, next);
    expect(await h.groupMd(0)).toBe("default text");
  });

  test("clearing the default context DELETES the ungrouped agents' mirrors", async () => {
    const h = await harness(["Ana", "Bo"]);
    const prev = layout([], { defaultContext: "ctx" });
    await syncGroupContextFiles(h.deps, h.ws, layout([]), prev);
    expect(await h.groupMd(0)).toBe("ctx");

    await syncGroupContextFiles(h.deps, h.ws, prev, layout([]));
    expect(await h.groupMd(0)).toBe(null);
    expect(await h.groupMd(1)).toBe(null);
  });

  test("an agent moved INTO a context-less team loses the default text", async () => {
    const h = await harness(["Ana"]);
    const prev = layout([group("g1", [])], { defaultContext: "ctx" });
    await syncGroupContextFiles(h.deps, h.ws, layout([]), prev);
    expect(await h.groupMd(0)).toBe("ctx");

    await syncGroupContextFiles(
      h.deps,
      h.ws,
      prev,
      layout([group("g1", [h.id(0)])], { defaultContext: "ctx" }),
    );
    expect(await h.groupMd(0)).toBe(null);
  });

  test("a plain reorder never even lists the workspace's agents", async () => {
    const h = await harness(["Ana", "Bo"]);
    await syncGroupContextFiles(
      h.deps,
      h.ws,
      layout([], { ungroupedOrder: [h.id(0), h.id(1)] }),
      layout([], { ungroupedOrder: [h.id(1), h.id(0)] }),
    );
    expect(h.listCalls()).toBe(0);
  });

  test("a reorder UNDER a default context still costs nothing", async () => {
    const h = await harness(["Ana", "Bo"]);
    const withContext = (order: string[]) =>
      layout([], { defaultContext: "ctx", ungroupedOrder: order });
    await syncGroupContextFiles(
      h.deps,
      h.ws,
      withContext([h.id(0), h.id(1)]),
      withContext([h.id(1), h.id(0)]),
    );
    expect(h.listCalls()).toBe(0);
  });

  test("no vfs/paths is a clean no-op, never a failed layout write", async () => {
    const h = await harness(["Ana"]);
    await expect(
      syncGroupContextFiles(
        { store: h.deps.store },
        h.ws,
        layout([]),
        layout([], { defaultContext: "ctx" }),
      ),
    ).resolves.toBeUndefined();
  });
});

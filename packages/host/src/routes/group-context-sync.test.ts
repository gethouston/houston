import type { SidebarLayout } from "@houston/protocol";
import { describe, expect, test } from "vitest";
import {
  diffGroupContext,
  resolveGroupContextByAgent,
} from "./group-context-sync";

const layout = (groups: SidebarLayout["groups"]): SidebarLayout => ({
  groups,
  ungroupedOrder: [],
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

describe("resolveGroupContextByAgent", () => {
  test("maps each member of a group with context to the trimmed context", () => {
    const map = resolveGroupContextByAgent(
      layout([group("g1", ["a1", "a2"], "  be terse  ")]),
    );
    expect([...map]).toEqual([
      ["a1", "be terse"],
      ["a2", "be terse"],
    ]);
  });

  test("a blank or whitespace-only context contributes nothing", () => {
    const map = resolveGroupContextByAgent(
      layout([group("g1", ["a1"], "   "), group("g2", ["a2"], "")]),
    );
    expect(map.size).toBe(0);
  });

  test("a group without a context field contributes nothing", () => {
    const map = resolveGroupContextByAgent(layout([group("g1", ["a1"])]));
    expect(map.has("a1")).toBe(false);
  });

  test("an agent in two groups with context: last in array order wins", () => {
    const map = resolveGroupContextByAgent(
      layout([group("g1", ["a1"], "first"), group("g2", ["a1"], "second")]),
    );
    expect(map.get("a1")).toBe("second");
  });
});

describe("diffGroupContext", () => {
  test("agent added to a group with context is reported changed", () => {
    const prev = layout([group("g1", [], "ctx")]);
    const next = layout([group("g1", ["a1"], "ctx")]);
    expect(diffGroupContext(prev, next)).toEqual(["a1"]);
  });

  test("editing a group's context text reports its members changed", () => {
    const prev = layout([group("g1", ["a1", "a2"], "old")]);
    const next = layout([group("g1", ["a1", "a2"], "new")]);
    expect(diffGroupContext(prev, next).sort()).toEqual(["a1", "a2"]);
  });

  test("clearing a group's context reports its former members changed", () => {
    const prev = layout([group("g1", ["a1"], "ctx")]);
    const next = layout([group("g1", ["a1"], "")]);
    expect(diffGroupContext(prev, next)).toEqual(["a1"]);
  });

  test("deleting the group entirely removes its members' context", () => {
    const prev = layout([group("g1", ["a1"], "ctx")]);
    const next = layout([]);
    expect(diffGroupContext(prev, next)).toEqual(["a1"]);
  });

  test("removing an agent from the group reports it changed", () => {
    const prev = layout([group("g1", ["a1", "a2"], "ctx")]);
    const next = layout([group("g1", ["a1"], "ctx")]);
    expect(diffGroupContext(prev, next)).toEqual(["a2"]);
  });

  test("no context change (only order/name churn) reports nothing", () => {
    const prev = layout([group("g1", ["a1", "a2"], "ctx")]);
    const next = layout([group("g1", ["a2", "a1"], "ctx")]);
    expect(diffGroupContext(prev, next)).toEqual([]);
  });

  test("an unchanged member keeps its context and is not reported", () => {
    const prev = layout([group("g1", ["a1", "a2"], "ctx")]);
    const next = layout([
      group("g1", ["a1", "a2"], "ctx"),
      group("g2", ["a3"], "other"),
    ]);
    expect(diffGroupContext(prev, next)).toEqual(["a3"]);
  });
});

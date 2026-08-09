import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  initialExpandedAgents,
  toggleExpandedAgent,
} from "../src/components/team-view/team-files/team-files-model.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = (id: string) => ({ id, name: id }) as Agent;

describe("team Files accordions", () => {
  it("auto-expands exactly one agent", () => {
    deepStrictEqual([...initialExpandedAgents([agent("one")])], ["one"]);
    deepStrictEqual(
      [...initialExpandedAgents([agent("one"), agent("two")])],
      [],
    );
  });

  it("allows multiple agents to remain expanded", () => {
    const first = toggleExpandedAgent(new Set<string>(), "one");
    deepStrictEqual([...toggleExpandedAgent(first, "two")], ["one", "two"]);
  });
});

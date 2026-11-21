import { expect, it } from "vitest";
import { listRoutes } from "../routes/registry/all";
import { OP_CHAIN, OP_EXCLUSIONS } from "./op-surface";

function agentGroups(): string[] {
  return [
    ...new Set(
      listRoutes()
        .filter((route) => route.phase === "agent")
        .map((route) => route.group),
    ),
  ];
}

it("the op chain serves every agent-phase group except the declared exclusions", () => {
  const expected = agentGroups().filter((group) => !(group in OP_EXCLUSIONS));
  expect([...OP_CHAIN].sort()).toEqual([...expected].sort());
});

it("every exclusion names a live group and says why the worker cannot serve it", () => {
  const groups = agentGroups();
  for (const [group, reason] of Object.entries(OP_EXCLUSIONS)) {
    expect(groups).toContain(group);
    expect(reason.length).toBeGreaterThan(20);
  }
});

it("no group is both excused and served", () => {
  for (const group of OP_CHAIN) expect(OP_EXCLUSIONS).not.toHaveProperty(group);
});

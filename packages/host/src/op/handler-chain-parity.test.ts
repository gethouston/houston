import { expect, it } from "vitest";
import { listRoutes } from "../routes/registry/all";
import { OP_CHAIN, OP_EXCLUSIONS } from "./op-surface";

/** Every group the registry's agent segment actually carries routes for. */
function agentGroups(): string[] {
  return [
    ...new Set(
      listRoutes()
        .filter((route) => route.phase === "agent")
        .map((route) => route.group),
    ),
  ];
}

/**
 * The pool-worker op chain used to be a SECOND hand-ordered copy of the
 * per-agent dispatch surface, and its own comment admitted the hazard: a route
 * added to one chain and not the other answered 404 as an op. It is now derived
 * from the registry, and this is what holds the derivation honest — the served
 * set is exactly the agent segment minus the groups the worker cannot answer.
 */
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

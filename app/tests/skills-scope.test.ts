import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  resolveSkillCreateTarget,
  scopeSkillRows,
} from "../src/components/skills-view/skills-scope.ts";

const rows = [
  { slug: "invoices", agents: [{ id: "a" }, { id: "b" }] },
  { slug: "contracts", agents: [{ id: "b" }] },
  // A workspace-store skill nobody loads yet: the library lists it, an
  // employee's own section must not.
  { slug: "payroll", agents: [] },
];

describe("scopeSkillRows", () => {
  it("keeps every row for the workspace library", () => {
    deepStrictEqual(
      scopeSkillRows(rows, null).map((r) => r.slug),
      ["invoices", "contracts", "payroll"],
    );
  });

  it("keeps only the skills the scoped employee is live on", () => {
    deepStrictEqual(
      scopeSkillRows(rows, "a").map((r) => r.slug),
      ["invoices"],
    );
    deepStrictEqual(
      scopeSkillRows(rows, "b").map((r) => r.slug),
      ["invoices", "contracts"],
    );
  });

  it("answers empty for an employee holding nothing", () => {
    deepStrictEqual(scopeSkillRows(rows, "c"), []);
  });

  it("never hands back the caller's array", () => {
    const all = scopeSkillRows(rows, null);
    strictEqual(all === rows, false);
  });
});

describe("resolveSkillCreateTarget", () => {
  it("uses the scoped employee without asking", () => {
    deepStrictEqual(
      resolveSkillCreateTarget({
        scopedAgentId: "a",
        agentIds: ["a", "b", "c"],
      }),
      { kind: "agent", agentId: "a" },
    );
  });

  it("takes the only employee the library has", () => {
    deepStrictEqual(
      resolveSkillCreateTarget({ scopedAgentId: null, agentIds: ["a"] }),
      { kind: "agent", agentId: "a" },
    );
  });

  it("asks once the library has more than one", () => {
    deepStrictEqual(
      resolveSkillCreateTarget({ scopedAgentId: null, agentIds: ["a", "b"] }),
      { kind: "choose" },
    );
  });

  it("has nothing to create against with no employees", () => {
    deepStrictEqual(
      resolveSkillCreateTarget({ scopedAgentId: null, agentIds: [] }),
      { kind: "none" },
    );
  });
});

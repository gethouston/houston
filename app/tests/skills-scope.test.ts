import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { scopeSkillRows } from "../src/components/skills-view/skills-scope.ts";

const rows = [
  { slug: "invoices", agents: [{ id: "a" }, { id: "b" }] },
  { slug: "contracts", agents: [{ id: "b" }] },
  { slug: "payroll", agents: [] },
];

describe("scopeSkillRows", () => {
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
    strictEqual(scopeSkillRows(rows, "b") === rows, false);
  });
});

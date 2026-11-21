import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  addableSkills,
  offersAddExisting,
} from "../src/components/skills-view/addable-skills.ts";

const rows = [
  { slug: "invoices", origin: "shared" as const, agents: [{ id: "a" }] },
  { slug: "payroll", origin: "shared" as const, agents: [] },
  { slug: "contracts", origin: "shared" as const, agents: [{ id: "b" }] },
  { slug: "onboarding", origin: "local" as const, agents: [{ id: "b" }] },
];

describe("addableSkills", () => {
  it("offers the store skills this employee does not load yet", () => {
    deepStrictEqual(
      addableSkills(rows, "a").map((r) => r.slug),
      ["payroll", "contracts"],
    );
  });

  it("drops a store skill the employee already loads", () => {
    deepStrictEqual(
      addableSkills(rows, "b").map((r) => r.slug),
      ["invoices", "payroll"],
    );
  });

  it("never offers another employee's own copy", () => {
    const slugs = addableSkills(rows, "c").map((r) => r.slug);
    deepStrictEqual(slugs, ["invoices", "payroll", "contracts"]);
  });

  it("offers nothing where the deployment serves no store", () => {
    deepStrictEqual(
      addableSkills([{ slug: "invoices", agents: [{ id: "b" }] }], "a"),
      [],
    );
  });
});

describe("offersAddExisting", () => {
  it("offers the add on an employee where the workspace shares skills", () => {
    strictEqual(offersAddExisting({ sharedStore: true }), true);
  });

  it("never offers it where the deployment serves no store", () => {
    strictEqual(offersAddExisting({ sharedStore: false }), false);
  });
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  addableSkills,
  offersAddExisting,
} from "../src/components/skills-view/addable-skills.ts";

/**
 * "Add an existing skill" offers an AI Employee the workspace store skills it
 * does not load yet. A skill that only exists as another employee's own copy
 * has no client-side move behind it, so it must never appear here.
 */
const rows = [
  // In the store, already loaded by "a".
  { slug: "invoices", origin: "shared" as const, agents: [{ id: "a" }] },
  // In the store, loaded by nobody.
  { slug: "payroll", origin: "shared" as const, agents: [] },
  // In the store, loaded by someone else.
  { slug: "contracts", origin: "shared" as const, agents: [{ id: "b" }] },
  // "b"'s own copy, which lives on that employee alone.
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

  it("offers nothing to the workspace library, which adds to nobody", () => {
    deepStrictEqual(addableSkills(rows, null), []);
  });

  it("offers nothing where the deployment serves no store", () => {
    // No `origin` at all is the copy-based model: every row is an agent's own.
    deepStrictEqual(
      addableSkills([{ slug: "invoices", agents: [{ id: "b" }] }], "a"),
      [],
    );
  });
});

/**
 * The add is a manifest write against the workspace store, so a deployment
 * that serves no store (`capabilities.sharedSkills: false` — every cloud
 * profile) can never satisfy it. Offering the menu item there opens a dialog
 * that is empty forever.
 */
describe("offersAddExisting", () => {
  it("offers the add on an employee where the workspace shares skills", () => {
    strictEqual(offersAddExisting({ agentId: "a", sharedStore: true }), true);
  });

  it("never offers it where the deployment serves no store", () => {
    strictEqual(offersAddExisting({ agentId: "a", sharedStore: false }), false);
  });

  it("never offers it in the library, which adds to nobody", () => {
    strictEqual(offersAddExisting({ agentId: null, sharedStore: true }), false);
  });
});

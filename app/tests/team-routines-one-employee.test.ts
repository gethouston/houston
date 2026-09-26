import { ok } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

// An employee's Routines section shows ONE employee's routines, so nothing in
// it may still ask "whose routine is this?" or "which employee?".

const DIR = new URL(
  "../src/components/team-view/team-routines/",
  import.meta.url,
);
const source = readdirSync(DIR)
  .map((name) => readFileSync(new URL(name, DIR), "utf8"))
  .join("\n");

describe("the Routines section is one employee's", () => {
  it("wears no per-row owner chip", () => {
    ok(!existsSync(new URL("team-routine-owner-chip.tsx", DIR)));
    ok(!source.includes("OwnerChip"));
    ok(!source.includes("oneOwner"));
  });

  it("never asks which employee a new routine is for", () => {
    ok(!source.includes("AgentPickerDialog"));
    ok(!source.includes("pickAgent"));
  });

  it("hands its chat host the employee itself, not a roster slice", () => {
    ok(!source.includes("teamAgents"));
    for (const name of [
      "team-routines.tsx",
      "use-team-routine-host.tsx",
      "use-pending-team-routine-chat.ts",
    ]) {
      ok(!readFileSync(new URL(name, DIR), "utf8").includes("scoped"), name);
    }
  });
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { effectiveSkillsByPath } from "../src/components/skills-view/effective-skills.ts";
import type { SkillSummary } from "../src/lib/types.ts";

/**
 * What an AI Employee actually RUNS is its own copies plus the workspace
 * skills its manifest switches on. The setup chat is fed that list: given only
 * the copies, a workspace skill just added to an employee opens a chat that
 * never starts, because the chat cannot find the skill it was asked for.
 */
const summary = (name: string): SkillSummary => ({
  name,
  title: null,
  description: "",
  version: 1,
  tags: [],
  created: null,
  last_used: null,
  category: null,
  featured: false,
  integrations: [],
  image: null,
  inputs: [],
  prompt_template: null,
});

const OWN = summary("onboarding");
const STORE = summary("meeting-prep");
const SHADOWED_STORE = summary("invoices");
const MY_INVOICES = summary("invoices");

const rows = [
  { summary: STORE, agents: [{ folderPath: "/ana" }, { folderPath: "/bo" }] },
  { summary: SHADOWED_STORE, agents: [{ folderPath: "/ana" }] },
  { summary: OWN, agents: [{ folderPath: "/ana" }] },
];

describe("effectiveSkillsByPath", () => {
  it("adds the workspace skills an employee loads to its own copies", () => {
    const byPath = effectiveSkillsByPath({
      rows,
      listsByPath: new Map([["/ana", [OWN, MY_INVOICES]]]),
    });
    deepStrictEqual(
      byPath.get("/ana")?.map((s) => s.name),
      ["onboarding", "invoices", "meeting-prep"],
    );
  });

  it("keeps the employee's own copy of a slug the workspace also has", () => {
    const byPath = effectiveSkillsByPath({
      rows,
      listsByPath: new Map([["/ana", [MY_INVOICES]]]),
    });
    strictEqual(
      byPath.get("/ana")?.find((s) => s.name === "invoices"),
      MY_INVOICES,
    );
  });

  it("stays undefined while the employee's own list is still loading", () => {
    const byPath = effectiveSkillsByPath({
      rows,
      listsByPath: new Map([["/ana", undefined]]),
    });
    strictEqual(byPath.get("/ana"), undefined);
    strictEqual(byPath.has("/ana"), true);
  });

  it("answers an empty list for an employee that runs nothing", () => {
    const byPath = effectiveSkillsByPath({
      rows: [],
      listsByPath: new Map([["/ana", []]]),
    });
    deepStrictEqual(byPath.get("/ana"), []);
  });

  it("never leaks one employee's skills into another's list", () => {
    const byPath = effectiveSkillsByPath({
      rows,
      listsByPath: new Map([
        ["/ana", [OWN]],
        ["/bo", []],
      ]),
    });
    deepStrictEqual(
      byPath.get("/bo")?.map((s) => s.name),
      ["meeting-prep"],
    );
  });
});

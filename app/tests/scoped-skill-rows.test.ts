import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { resolveScopedOverrides } from "../src/components/skills-view/skills-scope.ts";
import type { SkillSummary } from "../src/lib/types.ts";

const summary = (name: string, title: string): SkillSummary => ({
  name,
  title,
  description: `${title} description`,
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

const STORE_COPY = summary("invoices", "Invoices");
const ANAS_COPY = summary("invoices", "Invoices, Ana's way");

const rows = [
  {
    slug: "invoices",
    summary: STORE_COPY,
    origin: "shared" as const,
    agents: [{ id: "ana" }, { id: "bo" }],
    overriddenBy: [{ id: "ana" }],
  },
  {
    slug: "payroll",
    summary: summary("payroll", "Payroll"),
    origin: "shared" as const,
    agents: [{ id: "ana" }],
    overriddenBy: [],
  },
  {
    slug: "onboarding",
    summary: summary("onboarding", "Onboarding"),
    origin: "local" as const,
    agents: [{ id: "ana" }],
    overriddenBy: [],
  },
];

const locals = new Map([["invoices", ANAS_COPY]]);

describe("resolveScopedOverrides", () => {
  it("resolves an override to the copy the employee actually runs", () => {
    const [invoices] = resolveScopedOverrides(rows, "ana", locals);
    strictEqual(invoices.origin, "local");
    strictEqual(invoices.summary, ANAS_COPY);
    deepStrictEqual(invoices.agents, [{ id: "ana" }]);
  });

  it("keeps the override mark, which is what offers the workspace version", () => {
    const [invoices] = resolveScopedOverrides(rows, "ana", locals);
    deepStrictEqual(invoices.overriddenBy, [{ id: "ana" }]);
  });

  it("leaves a workspace skill this employee has not shadowed alone", () => {
    const [, payroll] = resolveScopedOverrides(rows, "ana", locals);
    strictEqual(payroll.origin, "shared");
    strictEqual(payroll, rows[1]);
  });

  it("leaves another employee's override alone", () => {
    const [invoices] = resolveScopedOverrides(rows, "bo", new Map());
    strictEqual(invoices.origin, "shared");
    strictEqual(invoices, rows[0]);
  });

  it("leaves the row untouched while the employee's list is still loading", () => {
    const [invoices] = resolveScopedOverrides(rows, "ana", undefined);
    strictEqual(invoices, rows[0]);
  });

  it("holds the row back while the read list holds no such copy", () => {
    const resolved = resolveScopedOverrides(rows, "ana", new Map());
    deepStrictEqual(
      resolved.map((r) => r.slug),
      ["payroll", "onboarding"],
    );
  });

  it("lists it again the moment the two reads agree", () => {
    const [invoices] = resolveScopedOverrides(rows, "ana", locals);
    strictEqual(invoices.summary, ANAS_COPY);
  });

  it("never hands back the caller's array", () => {
    strictEqual(resolveScopedOverrides(rows, "ana", undefined) === rows, false);
  });
});

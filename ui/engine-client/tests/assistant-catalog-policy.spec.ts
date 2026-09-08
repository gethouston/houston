import { describe, expect, it } from "vitest";
import { extractCatalog } from "../scripts/assistant-extractor.ts";
import { coverageViolations } from "../scripts/assistant-gate.ts";
import { parseAssistantDocs } from "../scripts/assistant-jsdoc.ts";
import { renderOperations } from "../scripts/assistant-render.ts";
import { annotation, realOptions } from "./assistant-catalog-support.ts";

/**
 * What the assistant is ALLOWED to do, judged against the live adapter: a call
 * that changes something either asks the user first or says in writing why it
 * need not, every identifier it takes is resolved or accounted for, and the
 * operations doc states both for every operation Houston ships.
 */

const live = extractCatalog(realOptions);
const visible = live.catalog.operations.filter((op) => !op.hidden);

describe("approval policy", () => {
  it("requires a written reason for an unconfirmed mutation", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const input = { ...annotation(), method, confirm: false };
      expect(coverageViolations([input]).map((v) => v.rule)).toContain(
        "unconfirmed-mutation",
      );
      expect(
        coverageViolations([{ ...input, unconfirmed: "Read-only search." }]),
      ).toEqual([]);
      expect(coverageViolations([{ ...input, confirm: true }])).toEqual([]);
    }
  });

  it("asks nothing more of a hidden operation than its hidden reason", () => {
    expect(
      coverageViolations([
        {
          ...annotation(),
          method: "POST",
          confirm: false,
          hidden: true,
          hiddenReason: "Only the user can finish this sign-in.",
        },
      ]),
    ).toEqual([]);
  });

  it("parses the reason off the tag", () => {
    expect(
      parseAssistantDocs(
        "/**\n * @assistant group:files unconfirmed: Creates an empty folder only.\n */",
      ),
    ).toMatchObject({
      unconfirmed: "Creates an empty folder only.",
      unknownTags: [],
    });
  });

  it("states one for every visible mutation the adapter ships", () => {
    const unstated = live.annotations.filter(
      (a) =>
        !a.hidden &&
        a.method &&
        a.method !== "GET" &&
        !a.confirm &&
        !a.unconfirmed?.trim(),
    );
    expect(unstated).toEqual([]);
  });

  it("confirms a full manifest replacement, which switches off what it omits", () => {
    expect(visible.find((op) => op.name === "putSkillsManifest")?.confirm).toBe(
      true,
    );
  });
});

describe("identifier policy", () => {
  it("fails an operation whose identifier nothing resolves or lists", () => {
    const [violation] = coverageViolations([
      { ...annotation(), openIdentifiers: ["teamId"] },
    ]);
    expect(violation).toMatchObject({ rule: "unresolved-identifier" });
    expect(violation.problem).toContain("teamId");
  });

  it("resolves or accounts for every identifier on a visible operation", () => {
    const open = visible.flatMap((op) =>
      op.params
        .filter((param) => param.source && !param.resolver && !param.unresolved)
        .map((param) => `${op.name}.${param.name}`),
    );
    expect(open).toEqual([]);
  });

  it("closes every integration-provider parameter to the two that exist", () => {
    const providers = visible.flatMap((op) =>
      op.params.filter(
        (p) =>
          p.name === "provider" &&
          op.route?.path.includes("/integrations/{provider}"),
      ),
    );
    expect(providers.length).toBeGreaterThan(0);
    for (const p of providers)
      expect(p.schema).toEqual({
        anyOf: [
          { const: "composio", type: "string" },
          { const: "custom", type: "string" },
        ],
      });
  });
});

describe("what the model and the approver read", () => {
  it("keeps agent-facing catalog prose free of em dashes", () => {
    expect(JSON.stringify(live.catalog)).not.toContain("—");
  });

  it("renders every operation's method, policy and parameter resolution", () => {
    const doc = renderOperations(live.catalog);
    expect(doc).toContain(
      "| Operation | Method | Confirmation | Hidden reason | Parameters |",
    );
    expect(doc).toContain("resolved:teams");
    expect(doc).toContain("unconfirmed: Read-only search");
    expect(doc).toContain("open: The directory lists routines, not their runs");
    for (const op of live.catalog.operations)
      expect(doc).toContain(`| \`${op.name}\` |`);
  });
});

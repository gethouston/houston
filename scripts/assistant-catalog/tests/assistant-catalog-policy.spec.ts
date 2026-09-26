import { describe, expect, it } from "vitest";
import { extractCatalog } from "../assistant-extractor.ts";
import { coverageViolations } from "../assistant-gate.ts";
import { parseAssistantDocs } from "../assistant-jsdoc.ts";
import { renderOperations } from "../assistant-render-docs.ts";
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
      expect(
        coverageViolations([
          { ...input, confirm: true, confirmed: "Irreversible." },
        ]),
      ).toEqual([]);
    }
  });

  it("requires a written reason for a confirmation too", () => {
    // The other half of the same decision. Every card ends the turn and asks
    // the person a question, and a `confirm` nobody justified is how the
    // surface drifts into asking about everything.
    const asking = { ...annotation(), method: "POST" as const, confirm: true };
    expect(coverageViolations([asking]).map((v) => v.rule)).toEqual([
      "confirm-unstated",
    ]);
    expect(
      coverageViolations([
        { ...asking, confirmed: "Irreversible. Nothing puts it back." },
      ]),
    ).toEqual([]);
    // Hidden with a reason is exempt from the whole reach family: the
    // operation raises no card because it is never dispatched at all.
    expect(
      coverageViolations([
        { ...asking, hidden: true, hiddenReason: "Returns a secret." },
      ]),
    ).toEqual([]);
  });

  it("fails an acknowledgement the code has already made untrue", () => {
    // A `debt:` note that outlives its refactor tells the next reader work is
    // still owed, and the drift check cannot see it: the generated output is
    // legitimately unchanged by a tag nobody reads any more.
    const [violation] = coverageViolations([
      { ...annotation(), routable: true, unroutableReason: "debt: no query." },
    ]);
    expect(violation).toMatchObject({ rule: "stale-unroutable" });
    expect(
      coverageViolations([
        {
          ...annotation(),
          routable: false,
          unroutableReason: "debt: no query.",
        },
      ]),
    ).toEqual([]);
  });

  it("states one for every confirmation the adapter ships", () => {
    const unstated = live.annotations.filter(
      (a) => a.confirm && !a.confirmed?.trim(),
    );
    expect(unstated.map((a) => a.name)).toEqual([]);
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
    expect(
      parseAssistantDocs(
        "/**\n * @assistant group:files confirm: Irreversible. Nothing puts the file back.\n */",
      ),
    ).toMatchObject({
      confirm: true,
      confirmed: "Irreversible. Nothing puts the file back.",
      unknownTags: [],
    });
    // A BARE `confirm` is grammar, not a typo: it raises the flag and files no
    // unknown tag, so the missing rationale is `confirm-unstated`'s to refuse
    // (above) with a message naming what is owed — rather than surfacing as an
    // unparsed tag, which would read as a spelling mistake.
    //
    // Written on ONE line on purpose: that block has no leading `*`, and a
    // parser that only recognises starred lines reads the tag as prose and
    // reports an operation with no group, no flag and nothing to complain
    // about — a `hidden:` written this way would publish the operation.
    expect(
      parseAssistantDocs("/** @assistant group:files confirm */"),
    ).toMatchObject({ confirm: true, group: "files", unknownTags: [] });
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
    expect(doc).toContain("resolved:members");
    expect(doc).toContain("unconfirmed: Reversible display preference");
    expect(doc).toContain("open: The directory lists routines, not their runs");
    for (const op of live.catalog.operations)
      expect(doc).toContain(`| \`${op.name}\` |`);
  });
});

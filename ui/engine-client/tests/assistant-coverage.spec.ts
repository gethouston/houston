import { describe, expect, it } from "vitest";
import { extractCatalog } from "../scripts/assistant-extractor.ts";
import {
  acknowledgements,
  type CoverageRule,
  coverageViolations,
  formatViolations,
} from "../scripts/assistant-gate.ts";
import { parseAssistantDocs } from "../scripts/assistant-jsdoc.ts";
import { annotation, realOptions } from "./assistant-catalog-support.ts";

const block = (...lines: string[]): string =>
  ["/**", ...lines.map((line) => ` * ${line}`), " */"].join("\n");

describe("@assistant tag parsing", () => {
  it("reads a description, a group and the confirm flag", () => {
    expect(
      parseAssistantDocs(
        block("Every thing.", "", "@assistant group:agents confirm"),
      ),
    ).toMatchObject({
      description: "Every thing.",
      group: "agents",
      confirm: true,
      hidden: false,
      unknownTags: [],
    });
  });

  it("accepts hidden with no reason, and reports none", () => {
    const docs = parseAssistantDocs(
      block("Thing.", "@assistant group:files hidden"),
    );
    expect(docs.hidden).toBe(true);
    expect(docs.hiddenReason).toBeUndefined();
    expect(docs.unknownTags).toEqual([]);
  });

  it("reads a reason that runs to the end of a combined line", () => {
    const docs = parseAssistantDocs(
      block(
        "Thing.",
        "@assistant group:api-keys confirm hidden: returns a secret; shown once.",
      ),
    );
    expect(docs).toMatchObject({
      group: "api-keys",
      confirm: true,
      hidden: true,
      hiddenReason: "returns a secret; shown once.",
    });
  });

  it("reads unroutable and unschematized reasons off their own lines", () => {
    const docs = parseAssistantDocs(
      block(
        "Thing.",
        "@assistant group:org",
        "@assistant unroutable: debt: the query is built into the path.",
        "@assistant unschematized: the subject varies per event type.",
      ),
    );
    expect(docs.unroutableReason).toBe(
      "debt: the query is built into the path.",
    );
    expect(docs.unschematizedReason).toBe("the subject varies per event type.");
    expect(docs.unknownTags).toEqual([]);
  });

  it("keeps a reason-free unroutable and any unknown word out of the grammar", () => {
    const docs = parseAssistantDocs(
      block("Thing.", "@assistant group:org unroutable", "@assistant sneaky"),
    );
    expect(docs.unroutableReason).toBeUndefined();
    expect(docs.unknownTags).toEqual(["unroutable", "sneaky"]);
  });
});

const rulesFor = (
  ...annotations: Parameters<typeof annotation>[0][]
): CoverageRule[] =>
  coverageViolations(annotations.map(annotation)).map(({ rule }) => rule);

describe("the coverage gate's rules", () => {
  it("passes an operation that is documented, grouped, routable and typed", () => {
    expect(rulesFor({})).toEqual([]);
  });

  it("fails an undocumented operation, passes a documented one", () => {
    expect(rulesFor({ documented: false })).toEqual(["undocumented"]);
    expect(rulesFor({ documented: true })).toEqual([]);
  });

  it("fails a missing group and one outside the taxonomy", () => {
    expect(rulesFor({ group: undefined })).toEqual(["ungrouped"]);
    expect(rulesFor({ group: "" })).toEqual(["ungrouped"]);
    expect(rulesFor({ group: "gadgets" })).toEqual(["misgrouped"]);
    expect(rulesFor({ group: "billing" })).toEqual([]);
  });

  it("fails a bare hidden and passes a reasoned one", () => {
    expect(rulesFor({ hidden: true })).toEqual(["unjustified-hidden"]);
    expect(
      rulesFor({ hidden: true, hiddenReason: "returns a secret." }),
    ).toEqual([]);
  });

  it("fails an unroutable operation until it says why", () => {
    expect(rulesFor({ routable: false })).toEqual(["unroutable"]);
    expect(
      rulesFor({ routable: false, unroutableReason: "multipart upload." }),
    ).toEqual([]);
  });

  it("fails free-form schemas until they say why", () => {
    expect(rulesFor({ unschematizedFields: ["input"] })).toEqual([
      "unschematized",
    ]);
    expect(
      rulesFor({
        unschematizedFields: ["input"],
        unschematizedReason: "open record.",
      }),
    ).toEqual([]);
  });

  it("fails an unknown tag, one violation per tag", () => {
    expect(rulesFor({ unknownTags: ["hiden:", "unschematized"] })).toEqual([
      "unknown-tag",
      "unknown-tag",
    ]);
  });

  // The exemption is the whole reason `hidden` must carry a reason: hiding an
  // operation silences the route and schema rules with it.
  it("exempts a reasoned hidden from the route and schema rules, a bare one never", () => {
    expect(
      rulesFor({
        hidden: true,
        hiddenReason: "binary upload.",
        routable: false,
        unschematizedFields: ["files"],
      }),
    ).toEqual([]);
    expect(
      rulesFor({
        hidden: true,
        routable: false,
        unschematizedFields: ["files"],
      }),
    ).toEqual(["unjustified-hidden", "unroutable", "unschematized"]);
  });

  it("names the operation, its file:line, the rule and the exact tag to add", () => {
    const output = formatViolations(
      coverageViolations([
        annotation({ name: "saveAttachments", routable: false }),
      ]),
    );
    expect(output).toContain("saveAttachments");
    expect(output).toContain("packages/web/src/engine-adapter/cp/things.ts:12");
    expect(output).toContain("unroutable:");
    expect(output).toContain(
      "@assistant unroutable: <why this cannot be auto-routed>",
    );
  });
});

describe("acknowledgements", () => {
  it("splits stated debt from a permanent exception and strips the marker", () => {
    expect(
      acknowledgements([
        annotation({
          name: "createApiKey",
          hidden: true,
          hiddenReason: "returns a secret.",
        }),
        annotation({
          name: "createRoutine",
          unschematizedReason: "debt: input is typed unknown.",
        }),
      ]),
    ).toEqual([
      {
        name: "createApiKey",
        kind: "hidden",
        reason: "returns a secret.",
        debt: false,
      },
      {
        name: "createRoutine",
        kind: "unschematized",
        reason: "input is typed unknown.",
        debt: true,
      },
    ]);
  });
});

describe("the live engine adapter", () => {
  it("passes the coverage gate", () => {
    expect(coverageViolations(extractCatalog(realOptions).annotations)).toEqual(
      [],
    );
  });
});

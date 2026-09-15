import { describe, expect, it } from "vitest";
import { extractCatalog } from "../assistant-extractor.ts";
import type { CoverageRule } from "../assistant-gate.ts";
import { handsViolations } from "../assistant-hands-rules.ts";
import { parseAssistantDocs } from "../assistant-jsdoc.ts";
import { annotation, realOptions } from "./assistant-catalog-support.ts";

/**
 * A withheld operation whose errand still has to happen, and what the person is
 * handed instead. The three rules below are the whole enforcement: without them
 * `hidden:` is a refusal with no follow-up, and the model learns only that
 * Houston will not do the thing.
 */

const rules = (...overrides: Parameters<typeof annotation>): CoverageRule[] =>
  handsViolations(annotation(...overrides)).map((finding) => finding.rule);

describe("the hands grammar", () => {
  it("reads the card off its own @assistant line", () => {
    expect(
      parseAssistantDocs(
        [
          "/**",
          " * Thing.",
          " * @assistant group:billing hidden: the person opens billing themselves.",
          " * @assistant hands: request_hands_on(billing)",
          " */",
        ].join("\n"),
      ),
    ).toMatchObject({
      hidden: true,
      hiddenReason: "the person opens billing themselves.",
      handsCard: "request_hands_on(billing)",
      unknownTags: [],
    });
  });

  it("refuses a bare `hands` that names no card", () => {
    const docs = parseAssistantDocs(
      ["/**", " * @assistant hands", " */"].join("\n"),
    );
    expect(docs.handsCard).toBeUndefined();
    expect(docs.unknownTags).toEqual(["hands"]);
  });
});

describe("hands-missing", () => {
  it("fires on a withheld mutation in a needs-hands group", () => {
    expect(rules({ group: "billing", hidden: true, method: "POST" })).toEqual<
      CoverageRule[]
    >(["hands-missing"]);
  });

  it("fires on every withheld file operation, read or write", () => {
    expect(rules({ group: "files", hidden: true, method: "GET" })).toEqual([
      "hands-missing",
    ]);
  });

  it("clears once a card or a written escape is named", () => {
    const withheld = {
      group: "billing",
      hidden: true,
      method: "POST",
    } as const;
    expect(
      rules({ ...withheld, handsCard: "request_hands_on(billing)" }),
    ).toEqual([]);
    expect(
      rules({ ...withheld, handsCard: "unreachable nobody can finish this." }),
    ).toEqual([]);
  });

  it("leaves alone what raises no errand", () => {
    // Visible: the assistant performs it. A read outside `files`: nothing
    // moves. A group nobody hands over: no screen exists to send them to.
    expect(rules({ group: "billing", method: "POST" })).toEqual([]);
    expect(rules({ group: "billing", hidden: true, method: "GET" })).toEqual(
      [],
    );
    expect(rules({ group: "agents", hidden: true, method: "POST" })).toEqual(
      [],
    );
  });

  it("leaves alone an operation with no derived route", () => {
    // `unroutable` already refuses an unstated one, and nothing dispatches it.
    expect(
      rules({ group: "providers", hidden: true, routable: false }),
    ).toEqual([]);
  });
});

describe("hands-unhidden", () => {
  it("fires on a card offered for a call the assistant may make", () => {
    expect(
      rules({ group: "billing", handsCard: "request_connection" }),
    ).toEqual(["hands-unhidden"]);
  });
});

describe("hands-unknown", () => {
  const bad = (handsCard: string) =>
    handsViolations(
      annotation({ group: "billing", hidden: true, method: "POST", handsCard }),
    );

  it("fires on a card outside the vocabulary", () => {
    expect(bad("request_anything").map((f) => f.rule)).toEqual([
      "hands-unknown",
    ]);
  });

  it("fires on a surface the app cannot open, and quotes the live list", () => {
    const [finding] = bad("request_hands_on(dashboard)");
    expect(finding.rule).toBe("hands-unknown");
    expect(finding.problem).toContain("routineWebhook");
  });

  it("fires on request_hands_on with no surface", () => {
    expect(bad("request_hands_on").map((f) => f.rule)).toEqual([
      "hands-unknown",
    ]);
  });

  it("fires on a surface attached to a card that opens no screen", () => {
    expect(bad("request_credential(files)").map((f) => f.rule)).toEqual([
      "hands-unknown",
    ]);
  });
});

describe("the live engine adapter", () => {
  const { catalog } = extractCatalog(realOptions);
  const find = (name: string) =>
    catalog.operations.find((operation) => operation.name === name);

  it("emits the card a withheld operation is handed over with", () => {
    expect(find("createPortal")?.hands).toEqual({
      kind: "card",
      tool: "request_hands_on",
      surface: "billing",
    });
    expect(find("integrations.connect")?.hands).toEqual({
      kind: "card",
      tool: "request_connection",
    });
  });

  it("emits the written escape when no card reaches it", () => {
    expect(find("providers.cancelLogin")?.hands).toMatchObject({
      kind: "unreachable",
    });
  });

  it("omits hands from every operation the assistant performs itself", () => {
    for (const operation of catalog.operations)
      if (!operation.hidden) expect(operation.hands).toBeUndefined();
  });
});

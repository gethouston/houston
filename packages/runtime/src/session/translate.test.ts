import { describe, expect, it } from "vitest";
import { translatePrompt } from "./translate";
import { parseTranslateResult } from "./translate-parse";

describe("parseTranslateResult", () => {
  const requested = [
    { id: "title", text: "Research a company" },
    { id: "body", text: "## Procedure" },
  ];

  it("maps every requested id, ignoring extras", () => {
    const raw = JSON.stringify({
      items: [
        { id: "body", text: "## Procedimiento" },
        { id: "title", text: "Investigar una empresa" },
        { id: "ghost", text: "ignored" },
      ],
    });
    expect(parseTranslateResult(raw, requested)).toEqual([
      { id: "title", text: "Investigar una empresa" },
      { id: "body", text: "## Procedimiento" },
    ]);
  });

  it("strips markdown fences around the JSON", () => {
    const raw = `\`\`\`json\n${JSON.stringify({
      items: requested,
    })}\n\`\`\``;
    expect(parseTranslateResult(raw, requested)).toHaveLength(2);
  });

  it("throws when an id is missing (never silently drop a surface)", () => {
    const raw = JSON.stringify({
      items: [{ id: "title", text: "Investigar una empresa" }],
    });
    expect(() => parseTranslateResult(raw, requested)).toThrow(/body/);
  });

  it("throws on non-JSON garbage", () => {
    expect(() => parseTranslateResult("nope", requested)).toThrow(
      /JSON parse failed/,
    );
  });
});

describe("translatePrompt", () => {
  it("names the supported languages", () => {
    expect(translatePrompt("es")).toContain("Latin-American Spanish");
    expect(translatePrompt("pt")).toContain("Brazilian Portuguese");
  });

  it("falls back to the raw tag for unknown languages", () => {
    expect(translatePrompt("fr")).toContain("'fr'");
  });
});

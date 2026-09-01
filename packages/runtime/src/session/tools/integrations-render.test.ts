import { describe, expect, it } from "vitest";
import {
  renderSearchItems,
  schemaSignature,
  type ToolMatch,
} from "./integrations-render";

/**
 * The Croma-incident guard: search results are a pick-list and must stay a
 * few KB — full schemas only for the top matches, signatures beyond, a hard
 * item cap, clipped descriptions. A ~100-tool MCP server must never again
 * produce a result that blows the backend's tool-result ceiling.
 */

const schema = {
  type: "object",
  properties: {
    name: { type: "string", description: "who to look up" },
    page: { type: "integer" },
  },
  required: ["name"],
};

const action = (i: number, overrides: Partial<ToolMatch> = {}): ToolMatch => ({
  action: `tools.croma.org.default.op${i}`,
  toolkit: "croma",
  description: `operation ${i}`,
  inputParams: schema,
  connected: true,
  status: "connected",
  ...overrides,
});

describe("schemaSignature", () => {
  it("summarizes an object schema with required markers", () => {
    expect(schemaSignature(schema)).toBe("{ name: string, page?: integer }");
  });

  it("returns null for anything that is not an object schema", () => {
    expect(schemaSignature(null)).toBeNull();
    expect(schemaSignature("nope")).toBeNull();
    expect(schemaSignature({ type: "object" })).toBeNull();
  });
});

describe("renderSearchItems", () => {
  it("keeps full schemas for the top matches and signatures for the rest", () => {
    const text = renderSearchItems(
      Array.from({ length: 10 }, (_, i) => action(i)),
    );
    const full = text.match(/params: \{"type":"object"/g) ?? [];
    const signatures = text.match(/params: \{ name: string/g) ?? [];
    expect(full).toHaveLength(6);
    expect(signatures).toHaveLength(4);
    expect(text).toContain("short params signature");
  });

  it("caps the rendered rows and counts the rest", () => {
    const text = renderSearchItems(
      Array.from({ length: 45 }, (_, i) =>
        action(i, { inputParams: undefined }),
      ),
    );
    expect(text).toContain("op29");
    expect(text).not.toContain("op30 ");
    expect(text).toContain("+15 more matched");
  });

  it("clips runaway descriptions", () => {
    const text = renderSearchItems([
      action(1, { description: "x".repeat(1000), inputParams: undefined }),
    ]);
    expect(text.length).toBeLessThan(300);
    expect(text).toContain("…");
  });

  it("a pathological single schema falls back to its signature", () => {
    const huge = {
      type: "object",
      properties: { name: { type: "string", description: "y".repeat(5000) } },
      required: ["name"],
    };
    const text = renderSearchItems([action(1, { inputParams: huge })]);
    expect(text).toContain("params: { name: string }");
    expect(text.length).toBeLessThan(600);
  });

  it("a large realistic result stays a few KB, far under the backend ceiling", () => {
    const verbose = {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [
          `field${i}`,
          { type: "string", description: "long docs ".repeat(60) },
        ]),
      ),
      required: ["field0"],
    };
    const text = renderSearchItems(
      Array.from({ length: 101 }, (_, i) =>
        action(i, { description: "d".repeat(400), inputParams: verbose }),
      ),
    );
    expect(text.length).toBeLessThan(24 * 1024);
  });

  it("renders toolkit-level rows with their status tag", () => {
    const text = renderSearchItems([
      {
        action: "",
        toolkit: "croma",
        description: "Official government records.",
        connected: false,
        status: "connectable",
      },
    ]);
    expect(text).toBe(
      "- croma (app, NOT CONNECTED): Official government records.",
    );
  });
});

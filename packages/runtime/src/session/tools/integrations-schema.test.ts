import { describe, expect, it } from "vitest";
import { renderSearchItems, schemaSignature } from "./integrations-render";

const customSchema = {
  $defs: { Name: { type: "string" } },
  definitions: { Count: { type: "integer" } },
  allOf: [
    {
      properties: {
        operation: { const: "lookup" },
        names: { type: ["array", "null"], items: { $ref: "#/$defs/Name" } },
        counts: {
          type: "object",
          additionalProperties: { $ref: "#/definitions/Count" },
        },
      },
      required: ["operation"],
    },
    {
      properties: {
        options: {
          allOf: [
            {
              properties: { name: { $ref: "#/$defs/Name" } },
              required: ["name"],
            },
            { properties: { count: { $ref: "#/definitions/Count" } } },
          ],
        },
        nullable: {
          type: ["object", "null"],
          properties: { id: { type: "string" } },
        },
        single: { allOf: [{ type: "integer" }] },
        external: { $ref: "https://example.test/schema.json" },
      },
      required: ["options"],
    },
  ],
};

const match = (inputParams: unknown) => ({
  action: "tools.croma.org.default.op1",
  toolkit: "croma",
  description: "Lookup",
  inputParams,
});

describe("custom MCP schemas", () => {
  it("keeps small schemas verbatim in detailed results", () => {
    expect(renderSearchItems([match(customSchema)])).toContain(
      `params: ${JSON.stringify(customSchema)}`,
    );
  });

  it("preserves literals, local refs, intersections, maps and nullable containers in signatures", () => {
    const signature = schemaSignature(customSchema);
    expect(signature).toContain(
      'operation: "lookup", options: { name: string, count?: integer }',
    );
    expect(signature).toContain("names?: string[]");
    expect(signature).toContain("counts?: { [key: string]: integer }");
    expect(signature).toContain("nullable?: { id?: string }");
    expect(signature).toContain("single?: integer");
    expect(signature).toContain("external?: any");
  });

  it("bounds recursive local refs", () => {
    expect(
      schemaSignature({
        $defs: { Recursive: { $ref: "#/$defs/Recursive" } },
        properties: { child: { $ref: "#/$defs/Recursive" } },
      }),
    ).toBe("{ child?: object }");
  });

  it("bounds every descent through arrays, unions and intersections", () => {
    for (const wrap of [
      (items: unknown) => ({ type: "array", items }),
      (member: unknown) => ({ anyOf: [member] }),
      (member: unknown) => ({ oneOf: [member] }),
      (member: unknown) => ({ allOf: [member] }),
    ]) {
      let nested: unknown = { type: "string" };
      for (let i = 0; i < 5000; i++) nested = wrap(nested);
      const signature = schemaSignature({ properties: { nested } });
      expect(signature?.length).toBeLessThan(100);
      expect(
        renderSearchItems([match({ properties: { nested } })]).length,
      ).toBeLessThan(1000);
    }
  });

  it("does not spend detailed slots on rows without schemas", () => {
    const text = renderSearchItems([
      match(undefined),
      match(undefined),
      match(customSchema),
    ]);
    expect(text).toContain(JSON.stringify(customSchema));
  });

  it("keeps late required parameters first and recovers parameters beyond the signature cut", () => {
    const schema = {
      required: ["required_last"],
      properties: {
        ...Object.fromEntries(
          Array.from({ length: 40 }, (_, i) => [
            `field_${i}`,
            {
              type: "string",
              description: `Description ${i} ${"x".repeat(200)}`,
            },
          ]),
        ),
        required_last: { type: "string", description: "Must be supplied" },
      },
    };
    const signature = schemaSignature(schema);
    expect(signature).toMatch(/^\{ required_last: string, /);
    expect(signature).not.toContain("field_39");
    expect(signature).toMatch(/string… \[signature cut\]$/);
    const detailed = renderSearchItems([match(schema)]);
    expect(detailed).toContain("\n    field_39?:");
    expect(detailed).toContain("\n    required_last:");
    expect(detailed.length).toBeLessThanOrEqual(3300);
  });

  it("cuts before a long enum instead of cutting inside a literal or nested comma", () => {
    const signature = schemaSignature({
      properties: {
        first: { type: "string" },
        choice: {
          enum: Array.from(
            { length: 12 },
            (_, i) => `${i} ", { [ ${"x".repeat(70)}`,
          ),
        },
      },
    });
    expect(signature).toBe("{ first?: string… [signature cut]");
  });
});

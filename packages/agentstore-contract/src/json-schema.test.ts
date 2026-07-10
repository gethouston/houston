import { describe, expect, it } from "vitest";
import { exampleAgentIr } from "./__fixtures__/example-ir";
import { AGENT_IR_VERSION, agentIrSchema } from "./ir";
import { agentIrJsonSchema } from "./json-schema";

describe("AgentIR JSON Schema", () => {
  it("mirrors a valid example (the fixture must parse under zod)", () => {
    expect(() => agentIrSchema.parse(exampleAgentIr)).not.toThrow();
  });

  it("pins the current IR version as a const", () => {
    expect(
      (agentIrJsonSchema.properties.irVersion as { const: string }).const,
    ).toBe(AGENT_IR_VERSION);
  });

  it("declares exactly the zod object's required top-level keys", () => {
    expect([...agentIrJsonSchema.required].sort()).toEqual([
      "identity",
      "instructions",
      "irVersion",
      "provenance",
    ]);
  });

  it("keeps defaulted arrays (skills/learnings/integrations/tags) optional", () => {
    const required = agentIrJsonSchema.required as readonly string[];
    expect(required).not.toContain("skills");
    expect(required).not.toContain("learnings");
    expect(required).not.toContain("integrations");
    const identity = agentIrJsonSchema.properties.identity;
    expect([...identity.required]).not.toContain("tags");
  });

  it("declares the same top-level property keys the fully-populated fixture carries", () => {
    expect(Object.keys(agentIrJsonSchema.properties).sort()).toEqual(
      Object.keys(exampleAgentIr).sort(),
    );
  });

  it("declares the same identity property keys the fixture carries", () => {
    expect(
      Object.keys(agentIrJsonSchema.properties.identity.properties).sort(),
    ).toEqual(Object.keys(exampleAgentIr.identity).sort());
  });

  it("requires exactly the non-defaulted identity keys", () => {
    expect([...agentIrJsonSchema.properties.identity.required].sort()).toEqual([
      "category",
      "creator",
      "description",
      "name",
      "slug",
    ]);
  });

  it("constrains icon and creator url fields to https (matching zod's httpsUrl)", () => {
    const iconUrl = (
      agentIrJsonSchema.properties.identity.properties.icon.oneOf[1] as {
        properties: { url: { pattern?: string } };
      }
    ).properties.url;
    const creatorUrl = agentIrJsonSchema.properties.identity.properties.creator
      .properties.url as { pattern?: string };
    expect(iconUrl.pattern).toBe("^https://");
    expect(creatorUrl.pattern).toBe("^https://");
  });

  it("advertises an absolute https $id at /api/schema/agent", () => {
    expect(agentIrJsonSchema.$id).toMatch(/^https:\/\//);
    expect(agentIrJsonSchema.$id).toMatch(/\/api\/schema\/agent$/);
  });
});

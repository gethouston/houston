import { AGENT_IR_VERSION } from "@houston/agentstore-contract";
import { describe, expect, it } from "vitest";
import { ingestIr, unwrapIrInput } from "./ingest";

const minimalRaw = {
  identity: {
    name: "Test Agent",
    description: "Does useful things.",
    category: "productivity",
    creator: { displayName: "Dana" },
  },
  instructions: "Be helpful.",
  provenance: { createdVia: "agent-post" },
};

describe("unwrapIrInput", () => {
  it("unwraps a { ir } envelope", () => {
    expect(unwrapIrInput({ ir: minimalRaw })).toBe(minimalRaw);
  });

  it("passes a bare IR through untouched", () => {
    expect(unwrapIrInput(minimalRaw as Record<string, unknown>)).toBe(
      minimalRaw,
    );
  });

  it("treats a non-object ir field as a bare body", () => {
    const body = { ir: "nope", identity: {} };
    expect(unwrapIrInput(body)).toBe(body);
  });
});

describe("ingestIr", () => {
  it("normalizes and validates a minimal submission", () => {
    const result = ingestIr(minimalRaw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ir.irVersion).toBe(AGENT_IR_VERSION);
      expect(result.ir.identity.slug).toBe("test-agent");
    }
  });

  it("maps a genuine schema failure to 422 invalid_ir", () => {
    const result = ingestIr({
      ...minimalRaw,
      instructions: "x".repeat(200_001),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.body.error).toBe("invalid_ir");
    }
  });

  it("blocks a leaked secret with 422 secrets_detected", () => {
    const result = ingestIr({
      ...minimalRaw,
      instructions: "Use key AKIAIOSFODNN7EXAMPLE to connect.",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.body.error).toBe("secrets_detected");
      expect(Array.isArray(result.body.findings)).toBe(true);
    }
  });
});

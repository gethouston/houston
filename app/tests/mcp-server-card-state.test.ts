import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  canSubmitMcp,
  mcpNeedsSecret,
} from "../src/components/mcp-server-card-state.ts";

describe("mcpNeedsSecret", () => {
  it("true for bearer and custom-header auth, false for none", () => {
    strictEqual(mcpNeedsSecret({ type: "none" }), false);
    strictEqual(mcpNeedsSecret({ type: "bearer" }), true);
    strictEqual(mcpNeedsSecret({ type: "header", header: "X-API-Key" }), true);
  });
});

describe("canSubmitMcp", () => {
  it("no-auth servers are always submittable regardless of the secret field", () => {
    strictEqual(canSubmitMcp({ type: "none" }, ""), true);
    strictEqual(canSubmitMcp({ type: "none" }, "ignored"), true);
  });

  it("secret-bearing auth requires a non-empty secret within the length bound", () => {
    strictEqual(canSubmitMcp({ type: "bearer" }, ""), false);
    strictEqual(canSubmitMcp({ type: "bearer" }, "   "), false);
    strictEqual(canSubmitMcp({ type: "bearer" }, "tok_abc123"), true);
    const header = { type: "header", header: "X-API-Key" } as const;
    strictEqual(canSubmitMcp(header, "a".repeat(4096)), true);
    strictEqual(canSubmitMcp(header, "a".repeat(4097)), false);
  });
});

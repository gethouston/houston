import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  canSubmitMcp,
  type McpProposal,
  mcpNeedsSecret,
  mcpProposalDismissKey,
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

describe("mcpProposalDismissKey", () => {
  const base: McpProposal = {
    name: "Acme Tracker",
    url: "https://mcp.acme.com",
    auth: { type: "bearer" },
    description: "Acme's issue tracker.",
  };

  it("is stable for the same activity + name + URL", () => {
    strictEqual(
      mcpProposalDismissKey("act_1", base),
      mcpProposalDismissKey("act_1", { ...base, description: "changed" }),
    );
  });

  it("differs by activity, name, or URL", () => {
    const a = mcpProposalDismissKey("act_1", base);
    strictEqual(a === mcpProposalDismissKey("act_2", base), false);
    strictEqual(
      a === mcpProposalDismissKey("act_1", { ...base, name: "Other" }),
      false,
    );
    strictEqual(
      a ===
        mcpProposalDismissKey("act_1", {
          ...base,
          url: "https://mcp.other.com",
        }),
      false,
    );
  });
});

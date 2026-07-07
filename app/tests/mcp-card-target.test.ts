import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PendingInteraction } from "@houston/protocol";
import { resolveMcpCardTarget } from "../src/components/mcp-server-card-state.ts";

const proposal = {
  name: "Acme Tracker",
  url: "https://mcp.acme.example",
  auth: { type: "bearer" },
  description: "Acme's issue tracker.",
} as const;

const interaction: PendingInteraction = {
  kind: "mcp_server",
  proposal,
  reason: "integration_search had no match",
};

describe("resolveMcpCardTarget", () => {
  it("returns the proposal when the host serves the mcp provider", () => {
    const target = resolveMcpCardTarget(true, "act-1", interaction, new Set());
    strictEqual(target?.proposal.name, "Acme Tracker");
    strictEqual(target?.reason, "integration_search had no match");
  });

  it("returns null on a host without the mcp provider (nothing to create against)", () => {
    // The model can still emit an mcp_server interaction there, but the gateway
    // has no `mcp` provider, so the card must NOT take over the composer (every
    // Add would 404). Gated on mcpIntegrationsSupported.
    strictEqual(
      resolveMcpCardTarget(false, "act-1", interaction, new Set()),
      null,
    );
  });

  it("returns null when there is no open activity", () => {
    strictEqual(resolveMcpCardTarget(true, null, interaction, new Set()), null);
  });

  it("returns null when the pending interaction is not an mcp proposal", () => {
    const connect: PendingInteraction = { kind: "connect", toolkit: "gmail" };
    strictEqual(resolveMcpCardTarget(true, "act-1", connect, new Set()), null);
    strictEqual(
      resolveMcpCardTarget(true, "act-1", undefined, new Set()),
      null,
    );
  });

  it("returns null once the user added or dismissed this exact proposal", () => {
    const first = resolveMcpCardTarget(true, "act-1", interaction, new Set());
    strictEqual(first === null, false);
    const resolved = new Set([first?.dismissKey ?? ""]);
    strictEqual(
      resolveMcpCardTarget(true, "act-1", interaction, resolved),
      null,
    );
  });
});

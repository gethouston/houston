import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { PendingInteraction } from "@houston/protocol";
import { resolveCustomCardTarget } from "../src/components/custom-integration-card-state.ts";

const proposal = {
  name: "Acme CRM",
  baseUrl: "https://api.acme.example",
  auth: { type: "header", header: "Authorization", prefix: "Bearer " },
  description: "Acme's customer records.",
} as const;

const interaction: PendingInteraction = {
  kind: "custom_integration",
  proposal,
  reason: "integration_search had no match",
};

describe("resolveCustomCardTarget", () => {
  it("returns the proposal when the host serves the custom provider", () => {
    const target = resolveCustomCardTarget(
      true,
      "act-1",
      interaction,
      new Set(),
    );
    strictEqual(target?.proposal.name, "Acme CRM");
    strictEqual(target?.reason, "integration_search had no match");
  });

  it("returns null on a composio-only host (no custom provider to create against)", () => {
    // The model can still emit a custom_integration interaction there, but the
    // gateway has no `custom` provider, so the card must NOT take over the
    // composer (every Add would 404). Gated on customIntegrationsSupported.
    strictEqual(
      resolveCustomCardTarget(false, "act-1", interaction, new Set()),
      null,
    );
  });

  it("returns null when there is no open activity", () => {
    strictEqual(
      resolveCustomCardTarget(true, null, interaction, new Set()),
      null,
    );
  });

  it("returns null when the pending interaction is not a custom proposal", () => {
    const connect: PendingInteraction = { kind: "connect", toolkit: "gmail" };
    strictEqual(
      resolveCustomCardTarget(true, "act-1", connect, new Set()),
      null,
    );
    strictEqual(
      resolveCustomCardTarget(true, "act-1", undefined, new Set()),
      null,
    );
  });

  it("returns null once the user added or dismissed this exact proposal", () => {
    const first = resolveCustomCardTarget(
      true,
      "act-1",
      interaction,
      new Set(),
    );
    strictEqual(first === null, false);
    const resolved = new Set([first?.dismissKey ?? ""]);
    strictEqual(
      resolveCustomCardTarget(true, "act-1", interaction, resolved),
      null,
    );
  });
});

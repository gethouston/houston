import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Capabilities } from "@houston-ai/engine-client";
import { canShowAgentShareBlock } from "../src/components/tabs/agent-access-model.ts";

describe("canShowAgentShareBlock", () => {
  const SINGLE_PLAYER: Capabilities = {};
  const SINGLE_PLAYER_EXPLICIT: Capabilities = { multiplayer: false };
  const OWNER: Capabilities = { multiplayer: true, role: "owner" };
  const ADMIN: Capabilities = { multiplayer: true, role: "admin" };
  const MEMBER: Capabilities = { multiplayer: true, role: "user" };

  it("single-player NEVER renders the share block, even though the caller manages everything", () => {
    // Regression guard: canManageAssignments short-circuits to true in
    // single-player (matrix v2), so gating on it alone would resurrect an
    // empty, non-functional org-share block on every self-host agent.
    strictEqual(
      canShowAgentShareBlock(SINGLE_PLAYER, { access: undefined }),
      false,
    );
    strictEqual(
      canShowAgentShareBlock(SINGLE_PLAYER, { access: "manager" }),
      false,
    );
    strictEqual(
      canShowAgentShareBlock(SINGLE_PLAYER_EXPLICIT, { access: "manager" }),
      false,
    );
    strictEqual(canShowAgentShareBlock(null, { access: "manager" }), false);
    strictEqual(
      canShowAgentShareBlock(undefined, { access: "manager" }),
      false,
    );
  });

  it("multiplayer owner sees the block for any agent", () => {
    strictEqual(canShowAgentShareBlock(OWNER, { access: undefined }), true);
    strictEqual(canShowAgentShareBlock(OWNER, { access: "user" }), true);
    strictEqual(canShowAgentShareBlock(OWNER, { access: "manager" }), true);
  });

  it("multiplayer admin sees the block only as an agent-manager, never by mere use", () => {
    strictEqual(canShowAgentShareBlock(ADMIN, { access: "manager" }), true);
    strictEqual(canShowAgentShareBlock(ADMIN, { access: "user" }), false);
    strictEqual(canShowAgentShareBlock(ADMIN, { access: undefined }), false);
  });

  it("multiplayer plain member with a use/absent access never sees the block", () => {
    strictEqual(canShowAgentShareBlock(MEMBER, { access: "user" }), false);
    strictEqual(canShowAgentShareBlock(MEMBER, { access: undefined }), false);
  });

  it("the client trusts the wire `access` field, which the gateway clamps by role", () => {
    // A role-`user` never carries `access="manager"` on the wire (the gateway
    // clamps stale rows away before they reach the client), so this pairing is
    // an impossible state. The pure gate trusts the already-effective `access`
    // rather than re-clamping by role, matching isAgentManager.
    strictEqual(canShowAgentShareBlock(MEMBER, { access: "manager" }), true);
  });
});

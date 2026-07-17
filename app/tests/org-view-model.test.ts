import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { AuditEntry, Capabilities } from "@houston-ai/engine-client";
import {
  AUDIT_PAGE_SIZE,
  canSeeOrganization,
  nextAuditCursor,
  ORG_TAB_IDS,
  orgTabIds,
} from "../src/components/organization/org-view-model.ts";

const SINGLE_PLAYER: Capabilities = {};
const SINGLE_PLAYER_EXPLICIT: Capabilities = { multiplayer: false };
const OWNER: Capabilities = { multiplayer: true, role: "owner" };
const ADMIN: Capabilities = { multiplayer: true, role: "admin" };
const MEMBER: Capabilities = { multiplayer: true, role: "user" };
// A multiplayer host that (invalidly) omits the role → clamp to least-privileged.
const NO_ROLE: Capabilities = { multiplayer: true };

describe("canSeeOrganization", () => {
  it("shows the Organization view to a multiplayer owner and admin", () => {
    strictEqual(canSeeOrganization(OWNER), true);
    strictEqual(canSeeOrganization(ADMIN), true);
  });

  it("hides it from plain members", () => {
    strictEqual(canSeeOrganization(MEMBER), false);
    strictEqual(canSeeOrganization(NO_ROLE), false);
  });

  it("hides it entirely in single-player (no org)", () => {
    strictEqual(canSeeOrganization(SINGLE_PLAYER), false);
    strictEqual(canSeeOrganization(SINGLE_PLAYER_EXPLICIT), false);
    strictEqual(canSeeOrganization(null), false);
    strictEqual(canSeeOrganization(undefined), false);
  });
});

describe("ORG_TAB_IDS", () => {
  it("is the always-present sections in display order", () => {
    strictEqual(ORG_TAB_IDS.join(","), "people,activity,usage");
  });
});

describe("orgTabIds", () => {
  it("appends billing only when in scope", () => {
    strictEqual(
      orgTabIds({ billing: false }).join(","),
      "people,activity,usage",
    );
    strictEqual(
      orgTabIds({ billing: true }).join(","),
      "people,activity,usage,billing",
    );
  });
});

function makePage(count: number): AuditEntry[] {
  // Newest-first: ids descend, so the last (oldest) is the smallest id.
  return Array.from({ length: count }, (_, i) => ({
    id: 1000 - i,
    orgId: "org",
    actor: "u",
    action: "agent.rename",
    subject: {},
    createdAt: 0,
  }));
}

describe("nextAuditCursor", () => {
  it("returns the oldest (last) entry's id when the page is full", () => {
    const page = makePage(AUDIT_PAGE_SIZE);
    strictEqual(nextAuditCursor(page), 1000 - (AUDIT_PAGE_SIZE - 1));
  });

  it("stops (undefined) on a short page — the tail was reached", () => {
    strictEqual(nextAuditCursor(makePage(AUDIT_PAGE_SIZE - 1)), undefined);
    strictEqual(nextAuditCursor([]), undefined);
  });
});

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
// C8 Spaces hosts: the personal/team split is live, so the gate keys on the
// active-space boolean too.
const SPACES_OWNER: Capabilities = {
  multiplayer: true,
  spaces: true,
  role: "owner",
};
const SPACES_ADMIN: Capabilities = {
  multiplayer: true,
  spaces: true,
  role: "admin",
};
const SPACES_MEMBER: Capabilities = {
  multiplayer: true,
  spaces: true,
  role: "user",
};

describe("canSeeOrganization", () => {
  it("shows the Organization view to a multiplayer owner and admin", () => {
    // Non-spaces (legacy Teams v2): the active-space boolean is irrelevant.
    strictEqual(canSeeOrganization(OWNER, false), true);
    strictEqual(canSeeOrganization(OWNER, true), true);
    strictEqual(canSeeOrganization(ADMIN, false), true);
  });

  it("hides it from plain members", () => {
    strictEqual(canSeeOrganization(MEMBER, true), false);
    strictEqual(canSeeOrganization(NO_ROLE, true), false);
  });

  it("hides it entirely in single-player (no org)", () => {
    strictEqual(canSeeOrganization(SINGLE_PLAYER, true), false);
    strictEqual(canSeeOrganization(SINGLE_PLAYER_EXPLICIT, true), false);
    strictEqual(canSeeOrganization(null, true), false);
    strictEqual(canSeeOrganization(undefined, true), false);
  });

  it("hides it in the personal space of a Spaces host, even for an owner", () => {
    strictEqual(canSeeOrganization(SPACES_OWNER, false), false);
    strictEqual(canSeeOrganization(SPACES_ADMIN, false), false);
  });

  it("shows it in a team space of a Spaces host for owner/admin", () => {
    strictEqual(canSeeOrganization(SPACES_OWNER, true), true);
    strictEqual(canSeeOrganization(SPACES_ADMIN, true), true);
  });

  it("hides it from a plain member even in a team space", () => {
    strictEqual(canSeeOrganization(SPACES_MEMBER, true), false);
  });
});

describe("ORG_TAB_IDS", () => {
  it("is the always-present sections in display order", () => {
    // Activity, Usage and Time worked are no longer sections: they are the
    // three LENSES of one Analytics section, which is why they do not appear
    // here. Company context is unconditional because the whole Admin view is
    // already gated on `canSeeOrganization`, which is false in a personal
    // space, so a second branch for it here would be dead code.
    strictEqual(ORG_TAB_IDS.join(","), "people,analytics,companyContext");
  });
});

describe("orgTabIds", () => {
  it("splices billing in after People only when it is in scope", () => {
    strictEqual(
      orgTabIds({ billing: false }).join(","),
      "people,analytics,companyContext",
    );
    strictEqual(
      orgTabIds({ billing: true }).join(","),
      "people,billing,analytics,companyContext",
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

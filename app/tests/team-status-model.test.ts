import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { BillingSummary, OrgRole } from "@houston-ai/engine-client";
import {
  daysLeftUntil,
  isNeedsUpgradeError,
  isPersonalSpaceError,
  type TeamStatusView,
  teamStatusView,
} from "../src/lib/team-status-model.ts";

const NOW = new Date("2026-07-08T12:00:00Z");

function billing(patch: Partial<BillingSummary>): BillingSummary {
  return { plan: "team", status: "trialing", seats: 3, ...patch };
}

function view(
  patch: Partial<Parameters<typeof teamStatusView>[0]>,
): TeamStatusView {
  return teamStatusView({
    hasSpaces: true,
    isTeamSpace: true,
    role: "owner",
    billing: billing({}),
    degraded: false,
    now: NOW,
    ...patch,
  });
}

describe("daysLeftUntil", () => {
  it("rounds partial days UP (a trial with hours left is 1 day)", () => {
    strictEqual(
      daysLeftUntil("2026-07-09T06:00:00Z", NOW), // 18h ahead
      1,
    );
  });

  it("counts whole days ahead", () => {
    strictEqual(daysLeftUntil("2026-07-15T12:00:00Z", NOW), 7);
  });

  it("clamps to 0 once elapsed", () => {
    strictEqual(daysLeftUntil("2026-07-08T11:59:59Z", NOW), 0);
    strictEqual(daysLeftUntil("2026-07-01T12:00:00Z", NOW), 0);
  });

  it("is timezone-independent (absolute instants)", () => {
    // Same instant expressed with an offset resolves to the same day count.
    strictEqual(
      daysLeftUntil("2026-07-09T06:00:00Z", NOW),
      daysLeftUntil("2026-07-09T08:00:00+02:00", NOW),
    );
  });

  it("returns 0 for an unparseable date", () => {
    strictEqual(daysLeftUntil("not-a-date", NOW), 0);
  });
});

describe("teamStatusView — gating", () => {
  it("renders nothing off a Spaces host", () => {
    strictEqual(view({ hasSpaces: false }).kind, "none");
  });

  it("renders nothing in a personal (non-team) space", () => {
    strictEqual(view({ isTeamSpace: false }).kind, "none");
  });

  it("renders nothing with no role (single-player)", () => {
    strictEqual(view({ role: null }).kind, "none");
  });
});

describe("teamStatusView — owner/admin (billing-driven)", () => {
  it("shows the trial pill with days left when trialing", () => {
    const v = view({
      billing: billing({
        status: "trialing",
        trialEndsAt: "2026-07-11T12:00:00Z",
      }),
    });
    strictEqual(v.kind, "trial");
    if (v.kind === "trial") strictEqual(v.daysLeft, 3);
  });

  it("shows a clock-less trial (no count) when trialing without a trial clock", () => {
    const v = view({ billing: billing({ status: "trialing" }) });
    strictEqual(v.kind, "trial");
    if (v.kind === "trial") strictEqual(v.daysLeft, null);
  });

  it("shows the owner degrade banner when expired", () => {
    const v = view({ role: "owner", billing: billing({ status: "expired" }) });
    strictEqual(v.kind, "degraded");
    if (v.kind === "degraded") strictEqual(v.isOwner, true);
  });

  it("shows the admin degrade banner (ask-owner copy) when expired", () => {
    const v = view({ role: "admin", billing: billing({ status: "expired" }) });
    strictEqual(v.kind, "degraded");
    if (v.kind === "degraded") strictEqual(v.isOwner, false);
  });

  it("renders nothing for a healthy team (free/active/past_due)", () => {
    for (const status of ["free", "active", "past_due"] as const) {
      strictEqual(view({ billing: billing({ status }) }).kind, "none");
    }
  });

  it("renders nothing while billing is still loading", () => {
    strictEqual(view({ billing: undefined }).kind, "none");
    strictEqual(view({ billing: null }).kind, "none");
  });
});

describe("teamStatusView — member (degrade-flag-driven)", () => {
  const asMember = (patch: Partial<Parameters<typeof teamStatusView>[0]>) =>
    view({ role: "user" as OrgRole, billing: null, ...patch });

  it("shows the ask-owner degrade banner when the team is degraded", () => {
    const v = asMember({ degraded: true });
    strictEqual(v.kind, "degraded");
    if (v.kind === "degraded") strictEqual(v.isOwner, false);
  });

  it("renders nothing for a member on a healthy team", () => {
    strictEqual(asMember({ degraded: false }).kind, "none");
  });
});

describe("isNeedsUpgradeError", () => {
  it("matches a gateway needs_upgrade rejection", () => {
    strictEqual(isNeedsUpgradeError({ code: "needs_upgrade" }), true);
    strictEqual(
      isNeedsUpgradeError({ body: { error: "needs_upgrade" } }),
      true,
    );
  });

  it("ignores other errors", () => {
    strictEqual(isNeedsUpgradeError({ code: "not_owner" }), false);
    strictEqual(isNeedsUpgradeError(new Error("boom")), false);
    strictEqual(isNeedsUpgradeError(null), false);
  });
});

describe("isPersonalSpaceError", () => {
  it("matches a gateway personal_space rejection", () => {
    strictEqual(isPersonalSpaceError({ code: "personal_space" }), true);
    strictEqual(
      isPersonalSpaceError({ body: { error: "personal_space" } }),
      true,
    );
  });

  it("ignores other errors", () => {
    strictEqual(isPersonalSpaceError({ code: "needs_upgrade" }), false);
    strictEqual(isPersonalSpaceError({ code: "not_owner" }), false);
    strictEqual(isPersonalSpaceError(new Error("boom")), false);
    strictEqual(isPersonalSpaceError(null), false);
  });
});

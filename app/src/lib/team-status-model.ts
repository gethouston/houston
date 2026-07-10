import type { BillingSummary, OrgRole } from "@houston-ai/engine-client";
import { shareErrorCode } from "./share-via-team.ts";

/**
 * Pure, DOM-free logic behind the C8 team-status surfaces (the trial countdown
 * pill + the degrade banner) and the `needs_upgrade` write-block toast. Kept out
 * of the `.tsx` so the days-left math and the visibility decision unit-test
 * under bare Node.
 *
 * Contract (C8 §Client UX): countdown/billing affordances are owner/admin-only;
 * members NEVER see billing data — on an expired team they see the degrade
 * banner with "ask your owner" copy, driven by `OrgSummary.degraded` (which
 * carries no billing detail). Nothing renders off a Spaces host or off a team
 * space (single-player / personal). Expiry is a DERIVED read with no push, so
 * the caller re-reads billing/orgs on entering a team space.
 */

/**
 * Whole days remaining until an ISO trial end, rounded UP (a trial with 30 min
 * left still reads "1 day left", never "0"), clamped at 0 once elapsed. Both
 * sides are absolute instants, so the subtraction is timezone-independent —
 * UTC-safe by construction. An unparseable date yields 0 (the trial pill then
 * shows no misleading count; the status still comes from the derived `status`).
 */
export function daysLeftUntil(trialEndsAt: string, now: Date): number {
  const end = Date.parse(trialEndsAt);
  if (Number.isNaN(end)) return 0;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** Inputs for {@link teamStatusView} — the shell resolves these from caps, the
 *  active workspace, and the billing/orgs reads. */
export interface TeamStatusInput {
  /** `caps.spaces` — the whole C8 Spaces surface feature-detect. */
  hasSpaces: boolean;
  /** The active workspace is a team (`org:*` id), not personal. */
  isTeamSpace: boolean;
  /** The caller's role in the ACTIVE space, or null off-multiplayer. */
  role: OrgRole | null;
  /** The active team's billing summary (owner/admin only); null/undefined for a
   *  member, while loading, or when the host serves no billing detail. */
  billing: BillingSummary | null | undefined;
  /** `OrgSummary.degraded` for the active space — the member-visible expired
   *  signal that carries no billing detail. */
  degraded: boolean;
  now: Date;
}

/**
 * What the team-status surface should render:
 * - `none`   — nothing (off-spaces, personal space, healthy team, or loading);
 * - `trial`  — the owner/admin trial pill; `daysLeft` is the countdown, or `null`
 *   for a trialing team whose trial clock (`trialEndsAt`) isn't written yet — the
 *   pill then shows a clock-less "Free trial" label instead of a misleading "0
 *   days left" (mirrors `trialDaysLeft`'s null path so the pill and the Billing
 *   tab agree);
 * - `degraded` — the expired-team banner for everyone; `isOwner` picks the copy
 *   (owner gets an Upgrade action; admins + members get "ask your owner", since
 *   only the owner can check out — C8 admin degrade asymmetry).
 */
export type TeamStatusView =
  | { kind: "none" }
  | { kind: "trial"; daysLeft: number | null }
  | { kind: "degraded"; isOwner: boolean };

const NONE: TeamStatusView = { kind: "none" };

/**
 * Decide the team-status surface. Owner/admin drive off the DERIVED billing
 * `status` (they hold billing detail); members have no billing and drive off the
 * `degraded` flag alone. Only `trialing` and `expired` surface anything —
 * `free`/`active`/`past_due` render nothing (a solo/paid/grace team is healthy
 * to the user).
 */
export function teamStatusView(input: TeamStatusInput): TeamStatusView {
  const { hasSpaces, isTeamSpace, role, billing, degraded, now } = input;
  if (!hasSpaces || !isTeamSpace || role === null) return NONE;

  const billingVisible = role === "owner" || role === "admin";
  if (billingVisible) {
    if (!billing) return NONE;
    if (billing.status === "trialing") {
      const daysLeft = billing.trialEndsAt
        ? daysLeftUntil(billing.trialEndsAt, now)
        : null;
      return { kind: "trial", daysLeft };
    }
    if (billing.status === "expired") {
      return { kind: "degraded", isOwner: role === "owner" };
    }
    return NONE;
  }

  // Plain member: no billing data — the degrade flag is the only signal.
  return degraded ? { kind: "degraded", isOwner: false } : NONE;
}

/**
 * True for a gateway `needs_upgrade` rejection (403) — an EXPECTED business
 * state (the team's trial expired and a non-owner attempted a write), NOT a
 * Houston bug. The write-surfacing layer routes it to a plain informational
 * toast instead of the red "report a bug" toast, matching how the share flow
 * treats its expected states (`isExpectedShareError`). Reuses the same
 * kind/code/body extractor.
 */
export function isNeedsUpgradeError(err: unknown): boolean {
  return shareErrorCode(err) === "needs_upgrade";
}

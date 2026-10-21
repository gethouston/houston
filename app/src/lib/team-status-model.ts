import type {
  BillingChoice,
  LockReason,
  OrgBilling,
  OrgRecoveryAction,
  OrgRole,
} from "@houston/engine-adapter";
import { orgRecovery, orgStanding } from "@houston/sdk";
import { shareErrorCode } from "./share-error.ts";

/**
 * Pure, DOM-free logic behind the shell's org-status strip and the
 * `needs_upgrade` write-block toast. What an org's state allows comes from the
 * SDK (`orgStanding`, `orgRecovery`); this only decides how the strip shows
 * it on this surface: which buttons fit, what the store apps leave out, and
 * what a checkout in flight disables.
 */

/** The recovery actions the strip draws as buttons. */
export type TeamStatusAction = Exclude<
  OrgRecoveryAction,
  "move_out" | "ask_owner"
>;

/** What the strip says after the state: ask the owner, or the store note. */
export type TeamStatusTail = "ask_owner" | "web_note" | null;

export interface TeamStatusInput {
  /** The active org's billing; `null` for a legacy org, `undefined` unread. */
  billing: OrgBilling | null | undefined;
  /** `OrgSummary.degraded`: a gateway without org billing flags a lock here. */
  degraded: boolean;
  /** The caller's role in the active org, or null while unknown. */
  role: OrgRole | null;
  choice: BillingChoice | null;
  /** `canPurchaseInApp()`: false in the store apps, which never sell. */
  purchasable: boolean;
  /** A checkout this app opened is still waiting to be paid. */
  checkoutOutstanding: boolean;
  /** The delete flow exists here (the Danger zone of a team the caller owns). */
  canDelete: boolean;
  now: number;
}

export type TeamStatusView =
  | { kind: "none" }
  | {
      kind: "scheduled" | "past_due" | "locked";
      lockAt: string | null;
      lockReason: LockReason | null;
      /** The caller pays for this org. */
      payer: boolean;
      /** The caller can move AI Employees out (owners and admins). */
      moveOut: boolean;
      tail: TeamStatusTail;
      /** Up to two buttons, the rest behind More. */
      buttons: TeamStatusAction[];
      more: TeamStatusAction[];
      /** A checkout is outstanding: the pay buttons are disabled. */
      waiting: boolean;
    };

const NONE: TeamStatusView = { kind: "none" };
const MAX_BUTTONS = 2;
const PAY: ReadonlySet<OrgRecoveryAction> = new Set(["checkout", "portal"]);

function drawn(
  action: OrgRecoveryAction,
  input: TeamStatusInput,
): action is TeamStatusAction {
  if (action === "move_out" || action === "ask_owner") return false;
  if (PAY.has(action)) return input.purchasable;
  if (action === "delete") return input.canDelete;
  return true;
}

/** Decide the strip for the active org. */
export function teamStatusView(input: TeamStatusInput): TeamStatusView {
  const { billing, role } = input;
  if (role === null) return NONE;
  const kind = orgStanding(billing, input.degraded);
  if (kind === "ok") return NONE;
  const offered = orgRecovery(billing, role, input.choice, input.now);
  const actions = offered.filter((a) => drawn(a, input));
  const payer = billing?.isBillingOwner === true;
  // An older gateway's degraded team carries no billing, so no one there is
  // known to pay: everyone reads "ask the owner".
  const askOwner = offered.includes("ask_owner") || !billing;
  const tail: TeamStatusTail = !input.purchasable
    ? payer
      ? "web_note"
      : null
    : askOwner
      ? "ask_owner"
      : null;
  return {
    kind,
    lockAt: billing?.lockAt ?? null,
    lockReason: billing?.lockReason ?? null,
    payer,
    moveOut: offered.includes("move_out"),
    tail,
    buttons: actions.slice(0, MAX_BUTTONS),
    more: actions.slice(MAX_BUTTONS),
    waiting: input.checkoutOutstanding && actions.some((a) => PAY.has(a)),
  };
}

/**
 * True for a gateway `needs_upgrade` rejection (403): a write on an org that is
 * locked, an EXPECTED business state, not a Houston bug. The write-surfacing
 * layer routes it to a plain informational toast instead of the red "report a
 * bug" toast, matching how the share flow treats its expected states
 * (`isExpectedShareError`). Reuses the same kind/code/body extractor.
 */
export function isNeedsUpgradeError(err: unknown): boolean {
  return shareErrorCode(err) === "needs_upgrade";
}

/**
 * True for a gateway `personal_space` rejection (403) — an EXPECTED business
 * state, NOT a Houston bug: the caller tried to add a member to their personal
 * space, which is non-invitable by design (sharing goes through creating a
 * team). Routed to a plain informational toast, exactly like
 * {@link isNeedsUpgradeError}, so the user learns to create a team instead of
 * seeing a red "report a bug" toast. Reuses the same kind/code/body extractor.
 */
export function isPersonalSpaceError(err: unknown): boolean {
  return shareErrorCode(err) === "personal_space";
}

/**
 * True for a gateway `last_owner` rejection (409) — an EXPECTED business state,
 * NOT a Houston bug: the caller tried to remove or demote an org's only owner,
 * and the org must keep at least one (the gateway's race-safe floor). Routed to
 * a plain informational toast, exactly like {@link isNeedsUpgradeError}, so the
 * owner learns to hand ownership to someone else first instead of seeing a red
 * "report a bug" toast. Reuses the same kind/code/body extractor.
 */
export function isLastOwnerError(err: unknown): boolean {
  return shareErrorCode(err) === "last_owner";
}

import type {
  BillingChoice,
  LockReason,
  OrgBilling,
  OrgRecoveryAction,
  OrgRole,
} from "@houston/engine-adapter";
import { orgRecovery, orgStanding } from "@houston/sdk";
import { shareErrorCode } from "./share-error.ts";

export type TeamStatusAction = Exclude<
  OrgRecoveryAction,
  "move_out" | "ask_owner"
>;

export type TeamStatusTail = "ask_owner" | "web_note" | null;

export interface TeamStatusInput {
  billing: OrgBilling | null | undefined;
  degraded: boolean;
  role: OrgRole | null;
  choice: BillingChoice | null;
  purchasable: boolean;
  checkoutOutstanding: boolean;
  canDelete: boolean;
  now: number;
}

export type TeamStatusView =
  | { kind: "none" }
  | {
      kind: "scheduled" | "past_due" | "locked";
      lockAt: string | null;
      lockReason: LockReason | null;
      payer: boolean;
      moveOut: boolean;
      tail: TeamStatusTail;
      buttons: TeamStatusAction[];
      more: TeamStatusAction[];
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

export function teamStatusView(input: TeamStatusInput): TeamStatusView {
  const { billing, role } = input;
  if (role === null) return NONE;
  const kind = orgStanding(billing, input.degraded);
  if (kind === "ok") return NONE;
  const offered = orgRecovery(billing, role, input.choice, input.now);
  const actions = offered.filter((a) => drawn(a, input));
  const payer = billing?.isBillingOwner === true;
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

export function isNeedsUpgradeError(err: unknown): boolean {
  return shareErrorCode(err) === "needs_upgrade";
}

export function isPersonalSpaceError(err: unknown): boolean {
  return shareErrorCode(err) === "personal_space";
}

export function isLastOwnerError(err: unknown): boolean {
  return shareErrorCode(err) === "last_owner";
}

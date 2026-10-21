import { formatLocalDate } from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { Clock, CreditCard, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTeamStatus } from "../../hooks/use-team-status";
import { useTeamStatusActions } from "../../hooks/use-team-status-actions";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import type { TeamStatusView } from "../../lib/team-status-model";
import { PlanWebNote } from "./plan-web-note";
import { TeamStatusButtons } from "./team-status-buttons";
import { TeamStatusClaimDialog } from "./team-status-claim-dialog";

type Shown = Exclude<TeamStatusView, { kind: "none" }>;

/** The first sentence: the state, worded by why the org locks. */
function leadKey(view: Shown, hasDate: boolean) {
  if (view.kind === "scheduled")
    return view.lockReason === "canceled"
      ? "status.scheduledCanceled"
      : "status.scheduled";
  if (view.kind === "past_due")
    return hasDate ? "status.pastDue" : "status.pastDueNoDate";
  if (view.lockReason === "canceled") return "status.lockedCanceled";
  if (view.lockReason === "payment_failed") return "status.lockedPayment";
  return "status.locked";
}

const ASK_OWNER = {
  scheduled: "status.askOwner.scheduled",
  past_due: "status.askOwner.pastDue",
  locked: "status.askOwner.locked",
} as const;

/**
 * The org-status strip at the top of the workspace, for the ACTIVE org (the
 * Personal row included): a lock scheduled, a payment that failed, or a lock.
 * It says what the state means, what the reader can still do, and offers the
 * way out the SDK allows them (`orgRecovery`): the billing owner pays,
 * swaps the free slot, changes the pick or deletes; everyone else is told to
 * ask the owner. The store apps never sell, so there the owner reads the
 * managed-on-the-web note instead of a pay button.
 *
 * Locked is the danger tone; a scheduled lock and a failed payment, which
 * still work, are calmer. On the phone the strip runs full width with its
 * actions on their own row; on the desktop it is one line.
 */
export function TeamStatusBanner() {
  const { t, i18n } = useTranslation("teams");
  const { view, org, orgs, checkout } = useTeamStatus(canPurchaseInApp());
  const actions = useTeamStatusActions(org?.slug ?? null, checkout);
  if (view.kind === "none" || !org) return null;

  const locked = view.kind === "locked";
  const date = view.lockAt ? formatLocalDate(view.lockAt, i18n.language) : null;
  const sentences = [t(leadKey(view, date !== null), { org: org.name, date })];
  if (locked)
    sentences.push(
      t(view.moveOut ? "status.lockedMoveOut" : "status.lockedRead"),
    );
  if (view.tail === "ask_owner") sentences.push(t(ASK_OWNER[view.kind]));
  if (view.waiting) sentences.push(t("status.waiting"));
  const Icon = locked ? Lock : view.kind === "past_due" ? CreditCard : Clock;

  return (
    <div
      role="status"
      data-testid="team-status-banner"
      data-state={view.kind}
      className={cn(
        "flex shrink-0 flex-col gap-2.5 border-b px-4 py-3 text-sm md:flex-row md:items-center md:justify-between md:gap-4 md:py-2",
        locked ? "border-danger/30 bg-danger/10" : "border-line bg-chip-subtle",
      )}
    >
      <div className="flex min-w-0 items-start gap-2 md:items-center">
        <Icon
          aria-hidden
          className={cn(
            "mt-0.5 size-4 shrink-0 md:mt-0",
            locked ? "text-danger-ink" : "text-warning-ink",
          )}
        />
        <div className="min-w-0 space-y-0.5">
          <p className="text-pretty text-ink">{sentences.join(" ")}</p>
          {view.tail === "web_note" && <PlanWebNote variant="manage" />}
          {actions.fallbackUrl && (
            <a
              href={actions.fallbackUrl}
              target="_blank"
              rel="noreferrer"
              className="text-link underline-offset-4 hover:underline"
            >
              {t("status.openPaymentPage")}
            </a>
          )}
        </div>
      </div>
      <TeamStatusButtons
        view={view}
        onAction={actions.run}
        paying={actions.paying}
      />
      <TeamStatusClaimDialog
        open={actions.claimOpen}
        onOpenChange={actions.setClaimOpen}
        org={org}
        orgs={orgs}
      />
    </div>
  );
}

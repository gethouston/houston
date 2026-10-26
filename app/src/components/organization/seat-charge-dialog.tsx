import type { OrgBilling } from "@houston/engine-adapter";
import {
  formatLocalDate,
  formatPlanAmount,
  seatChargeView,
} from "@houston/sdk";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Spinner,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { usePortal } from "../../hooks/queries/use-billing";
import type { ChargeDialog } from "./people-seat-flow";
import { SeatChargeRefusal } from "./seat-charge-refusal";

/**
 * Asks the payer of a yearly org to pay for one more seat before adding
 * someone: what is charged now (for the time left until renewal) and what
 * the plan costs at renewal with the seat. The confirm button names the
 * amount. A declined card or a bank check keeps the dialog up with nobody
 * added, Manage billing, and Try again. It cannot close while charging.
 */
export function SeatChargeDialog({
  dialog,
  billing,
  onPay,
  onCancel,
  onPortalOpened,
}: {
  dialog: ChargeDialog | null;
  billing: OrgBilling | null | undefined;
  onPay: () => void;
  onCancel: () => void;
  onPortalOpened: () => void;
}) {
  const { t, i18n } = useTranslation("teams");
  const portal = usePortal();
  if (!dialog) return null;
  const view = seatChargeView(dialog.quote, billing);
  const money = (cents: number) =>
    formatPlanAmount(cents, view.currency, i18n.language);
  const date = formatLocalDate(view.renewsAt, i18n.language);
  const amount = money(view.amountCents);
  const paying = dialog.phase === "paying";
  const refusal =
    dialog.phase === "declined" || dialog.phase === "needs_action"
      ? dialog.phase
      : null;
  const refused = refusal !== null;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !paying) onCancel();
      }}
    >
      <AlertDialogContent data-testid="seat-charge-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            {t("people.seatCharge.title", { email: dialog.email })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("people.seatCharge.lead")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="divide-y divide-line rounded-2xl border border-line bg-chip text-sm">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3.5 py-3">
            <dt className="font-medium">{t("people.seatCharge.nowLabel")}</dt>
            <dd className="text-right font-semibold tabular-nums">{amount}</dd>
            <dd className="col-span-2 text-ink-muted">
              {t("people.seatCharge.nowDetail", { date })}
            </dd>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3.5 py-3 text-ink-muted">
            <dt>{t("people.seatCharge.renewLabel", { date })}</dt>
            <dd className="text-right tabular-nums">
              {view.renewalCents !== null &&
                t("people.seatCharge.renewValue", {
                  total: money(view.renewalCents),
                })}
            </dd>
            <dd className="col-span-2">
              {t("people.seatCharge.renewDetail", {
                count: view.seatsAtRenewal,
              })}
            </dd>
          </div>
        </dl>
        {refusal && (
          <SeatChargeRefusal
            phase={refusal}
            email={dialog.email}
            portalOpened={dialog.portalOpened}
            portalFallbackUrl={portal.fallbackUrl}
          />
        )}
        <AlertDialogFooter>
          <Button variant="ghost" disabled={paying} onClick={onCancel}>
            {t("people.seatCharge.cancel")}
          </Button>
          {refused && (
            <Button
              variant="outline"
              disabled={portal.isPending}
              onClick={() =>
                portal.mutate(undefined, { onSuccess: onPortalOpened })
              }
            >
              {t("billing.manage")}
            </Button>
          )}
          <Button disabled={paying} onClick={onPay}>
            {paying ? (
              <>
                <Spinner aria-hidden="true" />
                {t("people.seatCharge.paying")}
              </>
            ) : refused ? (
              t("people.seatCharge.retry")
            ) : (
              t("people.seatCharge.confirm", { amount })
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

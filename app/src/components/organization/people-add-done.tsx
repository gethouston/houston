import { formatLocalDate, formatPlanAmount } from "@houston/sdk";
import { useTranslation } from "react-i18next";
import type { AddOutcome } from "./people-tab-model";

/**
 * The line after an add: who was added or invited, then what their seat
 * cost (charged now, a free paid seat, or the next monthly bill).
 */
export function PeopleAddDone({ outcome }: { outcome: AddOutcome | null }) {
  const { t, i18n } = useTranslation("teams");
  const seat = outcome?.seat ?? null;
  const seatLine =
    seat?.kind === "charged"
      ? t("people.seat.doneCharged", {
          amount: formatPlanAmount(
            seat.amountCents,
            seat.currency,
            i18n.language,
          ),
        })
      : seat?.kind === "free"
        ? t("people.seat.doneFree")
        : seat?.kind === "free_other"
          ? t("people.seat.doneFreeOther")
          : seat?.kind === "month"
            ? t("people.seat.doneMonth", {
                count: seat.seats,
                date: formatLocalDate(seat.nextBillAt, i18n.language),
              })
            : null;
  return (
    <p
      aria-live="polite"
      className="mt-2 min-h-4 text-xs text-success"
      data-testid="people-add-done"
    >
      {outcome?.kind === "added" &&
        t("people.add.added", { email: outcome.email })}
      {outcome?.kind === "invited" &&
        t("people.add.invited", { email: outcome.email })}
      {seatLine && ` ${seatLine}`}
    </p>
  );
}

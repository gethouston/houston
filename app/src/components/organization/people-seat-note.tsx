import type { OrgBilling } from "@houston/engine-adapter";
import {
  formatLocalDate,
  formatPlanAmount,
  type SeatQuote,
  seatNote,
} from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { PlanWebNote } from "../shell/plan-web-note";
import { BILLING_CURRENCY } from "./billing-tab-model";

/**
 * The line under the add form saying what adding someone costs, before
 * anything is sent (the SDK's `seatNote`). A free paid seat wears the success
 * dot. In the store apps a price is never named: a charged seat is bought on
 * the web, and the monthly price line is left out.
 */
export function PeopleSeatNote({
  quote,
  billing,
  purchasable,
}: {
  quote: SeatQuote | undefined;
  billing: OrgBilling | null | undefined;
  purchasable: boolean;
}) {
  const { t, i18n } = useTranslation("teams");
  const note = seatNote(quote, billing);
  if (!note) return null;
  if (!purchasable && note.kind === "year_full")
    return <PlanWebNote variant="managed" />;
  if (!purchasable && note.kind === "month") return null;
  const text =
    note.kind === "year_full"
      ? t("people.seat.yearFull")
      : note.kind === "year_free"
        ? t("people.seat.yearFree", { count: note.free })
        : note.kind === "other_free"
          ? t("people.seat.otherFree", { count: note.free })
          : note.kind === "other_full"
            ? note.ownerName
              ? t("people.seat.otherFullNamed", { name: note.ownerName })
              : t("people.seat.otherFull")
            : t("people.seat.month", {
                price: formatPlanAmount(
                  note.seatPriceCents,
                  BILLING_CURRENCY,
                  i18n.language,
                ),
                date: formatLocalDate(note.nextBillAt, i18n.language),
              });
  const free = note.kind === "year_free" || note.kind === "other_free";
  return (
    <p
      className="mt-2.5 flex items-start gap-2 text-sm"
      data-testid="people-seat-note"
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full",
          free ? "bg-success" : "bg-ink-muted",
        )}
      />
      <span className={note.kind === "other_full" ? "text-ink" : undefined}>
        {text}
      </span>
    </p>
  );
}

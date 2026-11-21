import type { SeatIntervalRefusal } from "@houston/engine-adapter";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../lib/error-report.ts";
import { showExpectedStateToast } from "../lib/error-toast.ts";

export function useSeatRefusalToast(): (refusal: SeatIntervalRefusal) => void {
  const { t } = useTranslation("teams");
  return useCallback(
    (refusal) => {
      if (refusal === "invalid_interval")
        reportError(
          "billing_checkout_interval",
          "Gateway refused an interval it advertised (invalid_interval)",
          refusal,
        );
      showExpectedStateToast(
        t("billing.yearlyUnavailable.title"),
        t("billing.yearlyUnavailable.body"),
      );
    },
    [t],
  );
}

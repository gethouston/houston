import type { SeatIntervalRefusal } from "@houston/engine-adapter";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../lib/error-report.ts";
import { showExpectedStateToast } from "../lib/error-toast.ts";

/**
 * Say that the gateway refused the interval a checkout asked for (the SDK's
 * `interval_unavailable` / `invalid_interval` outcomes): the person can pay
 * monthly, which the refetched prices now offer alone. `interval_unavailable`
 * is an expected state (yearly turned off since the prices were read). An
 * `invalid_interval` is ours: the app names "year" only where the gateway
 * advertised a yearly price, so client and gateway have drifted, and it is
 * reported as well.
 */
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

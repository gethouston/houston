import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { showExpectedStateToast } from "../lib/error-toast.ts";

/**
 * Say that the gateway refused the interval a checkout asked for (the SDK's
 * `interval_unavailable` / `invalid_interval` outcomes). An expected state,
 * never a bug: the person can pay monthly, which the refetched prices now
 * offer alone.
 */
export function useSeatRefusalToast(): () => void {
  const { t } = useTranslation("teams");
  return useCallback(
    () =>
      showExpectedStateToast(
        t("billing.yearlyUnavailable.title"),
        t("billing.yearlyUnavailable.body"),
      ),
    [t],
  );
}

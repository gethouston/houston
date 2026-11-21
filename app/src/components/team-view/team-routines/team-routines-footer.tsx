import { TimezonePicker } from "@houston-ai/routines";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";
import type { TimezoneState } from "../../../hooks/use-timezone-preference";
import { genericErrorDescription } from "../../../lib/error-report";
import { useUIStore } from "../../../stores/ui";

export function TeamRoutinesFooter({ tz }: { tz: TimezoneState }) {
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();
  const addToast = useUIStore((s) => s.addToast);

  const onTimezoneChange = useCallback(
    async (zone: string) => {
      try {
        await tz.confirm(zone);
        addToast({ title: t("toasts.timezoneSet", { zone }) });
      } catch (err) {
        addToast({
          title: t("toasts.timezoneError"),
          description: genericErrorDescription("set_timezone", err),
          variant: "error",
        });
      }
    },
    [tz, addToast, t],
  );

  return (
    <div className="shrink-0 border-t border-line/50 px-4 py-2">
      <TimezonePicker
        variant="bare"
        accountTimezone={tz.timezone ?? "UTC"}
        onTimezoneChange={onTimezoneChange}
        label={labels.grid.timezoneLabel}
        hint={labels.grid.timezoneHint}
        searchPlaceholder={labels.grid.timezoneSearchPlaceholder}
        noResults={labels.grid.timezoneNoResults}
      />
    </div>
  );
}

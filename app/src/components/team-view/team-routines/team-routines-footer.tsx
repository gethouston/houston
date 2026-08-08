import { TimezonePicker } from "@houston-ai/routines";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";
import type { TimezoneState } from "../../../hooks/use-timezone-preference";
import { genericErrorDescription } from "../../../lib/error-report";
import { useUIStore } from "../../../stores/ui";

/**
 * The Routines list's quiet footer: WHICH TIMEZONE every schedule on this list
 * is read and written in, and the one place to change it.
 *
 * It is not decoration. Schedule rows render their next-fire line against the
 * account zone, so a list that shows the zone without offering to fix it states
 * a fact the user cannot act on — and this is the only surface that ever
 * offered the control. It followed the routines list from the per-agent tab to
 * the team section for exactly that reason.
 */
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

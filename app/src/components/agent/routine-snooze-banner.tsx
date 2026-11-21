import type { Routine } from "@houston/engine-adapter";
import { formatLocalDateTime, routineSnoozeNotice } from "@houston/sdk";
import { useTranslation } from "react-i18next";
import { modelDisplayLabel } from "../../lib/model-labels";
import { providerName } from "../../lib/providers";
import { RoutineNoticeCard } from "./routine-notice-card";

export function RoutineSnoozeBanner({ routine }: { routine: Routine }) {
  const { t, i18n } = useTranslation("routines");
  const held = routineSnoozeNotice(routine);
  if (!held) return null;
  const time = formatLocalDateTime(held.until, i18n.language);
  const provider = providerName(held.provider);
  const model = held.model
    ? modelDisplayLabel(held.provider, held.model)
    : null;
  return (
    <RoutineNoticeCard
      data-testid="routine-snooze-banner"
      tone="warning"
      heading={t("details.snooze.title", { time })}
      body={
        model
          ? t("details.snooze.bodyWithModel", { provider, model, time })
          : t("details.snooze.body", { provider, time })
      }
      className="mx-auto mb-6 max-w-3xl"
    />
  );
}

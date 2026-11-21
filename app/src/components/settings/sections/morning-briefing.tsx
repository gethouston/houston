import { channelUnavailableReason } from "@houston/engine-adapter";
import { classifyHeartbeatFailure } from "@houston/sdk";
import {
  AsyncButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@houston-ai/core";
import { Clock, Sunrise, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChannels } from "../../../hooks/queries/use-channels";
import {
  useHeartbeat,
  useRunHeartbeatNow,
  useSetHeartbeat,
} from "../../../hooks/queries/use-heartbeat";
import { showExpectedStateToast } from "../../../lib/error-toast";
import {
  formatHeartbeatTime,
  heartbeatTimeOptions,
} from "../../../lib/heartbeat-times";
import { useUIStore } from "../../../stores/ui";
import { ASSISTANT_VIEW_ID } from "../../assistant/id";
import { OrgLockedFieldset } from "../../shell/org-locked-fieldset";
import { SettingsCard, SettingsControlRow } from "../settings-row";

export function MorningBriefingSection() {
  const { t, i18n } = useTranslation("settings");
  const channels = useChannels();
  const channelsAvailable =
    !!channels.data ||
    channelUnavailableReason(channels.error) === "not-configured";
  const addToast = useUIStore((s) => s.addToast);
  const heartbeat = useHeartbeat(true);
  const setHeartbeat = useSetHeartbeat();
  const runNow = useRunHeartbeatNow();
  const state = heartbeat.data;

  const handleRunNow = async () => {
    try {
      const result = await runNow.mutateAsync();
      if (result.status === "delivered") {
        useUIStore.getState().setViewMode(ASSISTANT_VIEW_ID);
        return;
      }
      addToast({ title: t("morningBriefing.quiet"), variant: "info" });
    } catch (err) {
      const { kind } = classifyHeartbeatFailure(err);
      if (kind === "turn_running")
        showExpectedStateToast(
          t("morningBriefing.busy.title"),
          t("morningBriefing.busy.description"),
        );
      else if (kind === "failed")
        showExpectedStateToast(
          t("morningBriefing.failed.title"),
          t("morningBriefing.failed.description"),
        );
    }
  };

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">
        {t("morningBriefing.title")}
      </h2>
      <p className="mb-6 text-sm text-ink-muted">
        {channelsAvailable
          ? t("morningBriefing.descriptionWithChannels")
          : t("morningBriefing.description")}
      </p>
      <OrgLockedFieldset>
        <SettingsCard>
          <SettingsControlRow
            icon={Sunrise}
            title={t("morningBriefing.enabled")}
          >
            <Switch
              checked={state?.enabled ?? true}
              disabled={!state}
              onCheckedChange={(enabled) => setHeartbeat.mutate({ enabled })}
              aria-label={t("morningBriefing.enabled")}
            />
          </SettingsControlRow>
          {state?.enabled && (
            <SettingsControlRow icon={Clock} title={t("morningBriefing.time")}>
              <Select
                value={state.time}
                onValueChange={(time) => setHeartbeat.mutate({ time })}
              >
                <SelectTrigger
                  aria-label={t("morningBriefing.timeLabel")}
                  className="w-32 rounded-lg"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {heartbeatTimeOptions(state.time).map((time) => (
                    <SelectItem key={time} value={time}>
                      {formatHeartbeatTime(time, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsControlRow>
          )}
          <SettingsControlRow
            icon={Zap}
            title={t("morningBriefing.runNow.title")}
            description={t("morningBriefing.runNow.description")}
            stack
          >
            <AsyncButton variant="outline" size="sm" onClick={handleRunNow}>
              {t("morningBriefing.runNow.action")}
            </AsyncButton>
          </SettingsControlRow>
        </SettingsCard>
      </OrgLockedFieldset>
    </section>
  );
}

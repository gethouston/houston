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
import { SettingsControlRow } from "../settings-row";

/**
 * The AI Manager's morning briefing: on/off, the time it arrives, and "brief
 * me now". Rendered only where the deployment serves it
 * (`capabilities.heartbeat`, gated by the caller).
 */
export function MorningBriefingSection() {
  const { t, i18n } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const heartbeat = useHeartbeat(true);
  const setHeartbeat = useSetHeartbeat();
  const runNow = useRunHeartbeatNow();
  const state = heartbeat.data;

  const handleRunNow = async () => {
    try {
      const result = await runNow.mutateAsync();
      if (result.status === "delivered") {
        // The briefing is being written in the manager's chat: go read it.
        useUIStore.getState().setViewMode(ASSISTANT_VIEW_ID);
        return;
      }
      addToast({ title: t("morningBriefing.quiet"), variant: "info" });
    } catch (err) {
      // The engine call already surfaced every kind but these two, which it
      // leaves to us because the person can act on them.
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
    <>
      <SettingsControlRow
        icon={Sunrise}
        title={t("morningBriefing.title")}
        description={t("morningBriefing.description")}
      >
        <Switch
          checked={state?.enabled ?? true}
          disabled={!state}
          onCheckedChange={(enabled) => setHeartbeat.mutate({ enabled })}
          aria-label={t("morningBriefing.title")}
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
    </>
  );
}

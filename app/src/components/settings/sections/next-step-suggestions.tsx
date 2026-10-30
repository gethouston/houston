import { Switch } from "@houston-ai/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tauriPreferences } from "../../../lib/tauri";
import { SettingsControlRow } from "../settings-row";

const queryKey = ["preferences", "nextStepSuggestions"];

export function NextStepSuggestionsSection() {
  const { t } = useTranslation("settings");
  const queries = useQueryClient();
  const preference = useQuery({
    queryKey,
    queryFn: tauriPreferences.getNextStepSuggestions,
  });
  const write = useMutation({
    mutationFn: tauriPreferences.setNextStepSuggestions,
    onSuccess: (enabled) => queries.setQueryData(queryKey, enabled),
  });
  return (
    <SettingsControlRow
      icon={ListPlus}
      title={t("nextStepSuggestions.title")}
      description={t("nextStepSuggestions.description")}
    >
      <Switch
        checked={preference.data ?? true}
        disabled={preference.data === undefined || write.isPending}
        onCheckedChange={(enabled) => write.mutate(enabled)}
        aria-label={t("nextStepSuggestions.title")}
      />
    </SettingsControlRow>
  );
}

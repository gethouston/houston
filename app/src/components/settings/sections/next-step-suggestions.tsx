import { Switch } from "@houston-ai/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../../lib/query-keys";
import { tauriPreferences } from "../../../lib/tauri";
import { SettingsControlRow } from "../settings-row";

/**
 * Refreshed by the host's `PreferencesChanged` event, so a change the AI
 * Manager makes shows here at once. A failed read (already reported) leaves
 * the switch usable at the default, since a write still lands.
 */
export function NextStepSuggestionsSection() {
  const { t } = useTranslation("settings");
  const queries = useQueryClient();
  const queryKey = queryKeys.nextStepSuggestions();
  const preference = useQuery({
    queryKey,
    queryFn: tauriPreferences.getNextStepSuggestions,
    retry: false,
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
        disabled={preference.isPending || write.isPending}
        onCheckedChange={(enabled) => write.mutate(enabled)}
        aria-label={t("nextStepSuggestions.title")}
      />
    </SettingsControlRow>
  );
}

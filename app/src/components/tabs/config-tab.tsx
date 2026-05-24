import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TabProps } from "../../lib/types";
import { tauriConfig } from "../../lib/tauri";
import { queryKeys } from "../../lib/query-keys";
import { SettingsForm } from "./configure-sections";

export default function ConfigTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const path = agent.folderPath;
  const { data: config } = useQuery({
    queryKey: queryKeys.config(path),
    queryFn: () => tauriConfig.read(path).catch(() => ({})),
  });

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h2 className="text-sm font-medium text-foreground">
          {t("configure.settings.title")}
        </h2>
        <p className="text-xs text-muted-foreground/60 mt-0.5 mb-3">
          {t("configure.settings.description")}
        </p>
        <SettingsForm agentPath={path} config={config ?? {}} />
      </div>
    </div>
  );
}

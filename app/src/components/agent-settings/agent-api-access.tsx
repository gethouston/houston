import { BookOpen, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEVELOPER_DOCS } from "../../lib/agent-connect-model";
import { tauriSystem } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { SettingsRow } from "../settings/settings-row";
import { BackControl } from "../shell/back-control";
import { AgentApiDetails } from "./agent-api-details";

export function AgentApiAccess({
  agent,
  onBack,
}: {
  agent: Agent;
  onBack: () => void;
}) {
  const { t } = useTranslation(["settings", "teams"]);

  return (
    <section>
      <BackControl
        label={t("teams:agentSettings.manage.sectionTitle")}
        onClick={onBack}
      />
      <h2 className="mt-4 text-lg font-semibold text-ink">
        {t("settings:apiKeys.agentAccess.title")}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {t("settings:apiKeys.agentAccess.intro", { name: agent.name })}
      </p>
      <div className="mt-4">
        <AgentApiDetails agent={agent}>
          <SettingsRow
            icon={KeyRound}
            title={t("settings:apiKeys.agentAccess.keysRow")}
            description={t("settings:apiKeys.agentAccess.keysRowDescription", {
              name: agent.name,
            })}
            onClick={() => useUIStore.getState().openSettings("apiKeys")}
          />
          <SettingsRow
            icon={BookOpen}
            title={t("settings:apiKeys.agentAccess.docsRow")}
            description={t("settings:apiKeys.agentAccess.docsRowDescription", {
              name: agent.name,
            })}
            chevron={false}
            onClick={() => void tauriSystem.openUrl(DEVELOPER_DOCS.overview)}
          />
        </AgentApiDetails>
      </div>
    </section>
  );
}

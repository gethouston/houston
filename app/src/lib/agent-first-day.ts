import type { FirstDayStartResult } from "@houston/engine-adapter";
import {
  firstDayAccountBlocked,
  isFirstDayNoProvider,
  isFirstDayNotPending,
  isFirstDayProviderUnavailable,
} from "@houston/sdk/agents/first-day-refusal";
import { registerSetupGreeting } from "../hooks/use-setup-greeting";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { useUIStore } from "../stores/ui";
import { recordFirstDayStarted } from "./agent-provisioning/born-config";
import { tauriAgents } from "./agents-facade";
import { analytics } from "./analytics";
import { publishCreatedMission } from "./created-mission-handoff";
import i18n from "./i18n";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";

export { isFirstDayPending } from "./agent-first-day-model";

const engineAnswered = (agentPath: string) =>
  useAgentProvisioningStore.getState().engineAnswered(agentPath);

export interface FirstDayAgent {
  id: string;
  name: string;
  folderPath: string;
}

export async function startEmployeeFirstDay(
  agent: FirstDayAgent,
): Promise<boolean> {
  const configKey = queryKeys.config(agent.folderPath);
  let result: FirstDayStartResult;
  try {
    result = await tauriAgents.startFirstDay(agent.folderPath, {
      locale: i18n.language,
      title: i18n.t("agentOnboarding:setupMission.title"),
    });
  } catch (err) {
    if (
      isFirstDayNotPending(err) ||
      isFirstDayProviderUnavailable(err) ||
      firstDayAccountBlocked(err)
    )
      engineAnswered(agent.folderPath);
    if (isFirstDayNoProvider(err)) {
      engineAnswered(agent.folderPath);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.providerStatuses(),
      });
    }
    void queryClient.invalidateQueries({ queryKey: configKey });
    return false;
  }
  if (result.outcome === "started") {
    analytics.track(
      "agent_onboarding_started",
      result.arrival ? { source: result.arrival } : undefined,
    );
    registerSetupGreeting({
      agentPath: agent.folderPath,
      sessionKey: result.mission.sessionKey,
      agentName: agent.name,
      role: result.role,
    });
  }
  recordFirstDayStarted(queryClient, agent.folderPath);
  engineAnswered(agent.folderPath);
  publishCreatedMission({
    activityId: result.mission.id,
    agentPath: agent.folderPath,
    sessionKey: result.mission.sessionKey,
  });
  useUIStore
    .getState()
    .setActivityPanelId(result.mission.id, { forceOpen: true });
  return true;
}

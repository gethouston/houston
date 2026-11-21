import type { Capabilities, MissionTitle } from "@houston/engine-adapter";
import { type MissionTitlePlan, planMissionTitle } from "@houston/sdk";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";
import { tauriActivity } from "./tauri";

export { fallbackMissionTitle } from "./mission-title-text";

export function missionTitlePlan(
  title: MissionTitle | undefined,
): MissionTitlePlan {
  const capabilities = queryClient.getQueryData<Capabilities>(
    queryKeys.capabilities(),
  );
  return planMissionTitle(capabilities ?? null, title);
}

export function titleLandedMission(
  agentPath: string,
  activityId: string,
  plan: MissionTitlePlan,
): void {
  void tauriActivity.titleFromClient(agentPath, activityId, plan.client);
}

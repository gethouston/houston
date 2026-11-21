import { isAgentGoneError } from "./agent-gone";
import type {
  CreateMissionAgent,
  CreateMissionOptions,
} from "./create-mission";
import type { MissionIdentity } from "./create-mission-now";
import { getEngine } from "./engine";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { missionRowInput } from "./mission-row";
import { healStaleRosterFromError } from "./roster-heal";
import { surfaceEngineError, tauriActivity } from "./tauri";

export async function landMissionRow(
  agent: CreateMissionAgent,
  opts: CreateMissionOptions,
  mission: MissionIdentity,
): Promise<string | null> {
  const input = missionRowInput(mission, opts);
  try {
    const created = await tauriActivity.createWithIdAttempt(
      agent.folderPath,
      input,
    );
    if (created.id !== mission.conversationId) {
      await getEngine().updateActivity(agent.folderPath, created.id, {
        session_key: mission.sessionKey,
      });
    }
    return created.id;
  } catch (e) {
    await surfaceEngineError("create_activity", e, undefined, {
      toast: false,
      silence: isAgentGoneError,
    });
    if (isAgentGoneError(e)) {
      healStaleRosterFromError(e);
      return null;
    }
    showErrorToast(
      "create_mission_now",
      "mission row create/update failed",
      e,
      {
        userMessage: i18n.t("chat:errors.missionRowFailed"),
      },
    );
    return null;
  }
}

/**
 * The board-row half of an optimistic mission create (`create-mission-now.ts`):
 * one id-honoring POST, re-issued while the agent's pod is still waking.
 */

import { isAgentGoneError } from "./agent-gone";
import type {
  CreateMissionAgent,
  CreateMissionOptions,
} from "./create-mission";
import type { MissionIdentity } from "./create-mission-now";
import { getEngine } from "./engine";
import { isEngineWakingError } from "./engine-waking-error";
import { showErrorToast } from "./error-toast";
import i18n from "./i18n";
import { logger } from "./logger";
import { missionRowInput } from "./mission-row";
import { healStaleRosterFromError } from "./roster-heal";
import { surfaceEngineError, tauriActivity } from "./tauri";
import { MISSION_ROW_WAKING_RETRY_MS, retryWhileWaking } from "./waking-retry";

/**
 * Land the board row through the host's single id-honoring POST. Resolves the
 * landed id (differs from ours only under version skew — an engine predating
 * client-supplied ids assigned its own, so its row is stamped with our session
 * key to keep the card opening this chat), or null after toasting: losing the
 * card must never lose the message.
 */
export async function landMissionRow(
  agent: CreateMissionAgent,
  opts: CreateMissionOptions,
  mission: MissionIdentity,
): Promise<string | null> {
  const input = missionRowInput(mission, opts);
  try {
    // The POST rides the gateway's wake hold; when that hold gives up on a
    // stalled control plane it answers the waking 503, and the pod answers a
    // little later (PRODUCT-1736). Re-issue along the SDK send's ladder
    // rather than dropping the card. Attempts run with the engine-call
    // surface deferred (`createWithIdAttempt`): one ladder is one failure,
    // reported once below, never once per rung.
    const created = await retryWhileWaking(
      () => tauriActivity.createWithIdAttempt(agent.folderPath, input),
      MISSION_ROW_WAKING_RETRY_MS,
      {
        isWaking: isEngineWakingError,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        onRetry: (err, delayMs) =>
          logger.warn(
            `[create-mission-now] board row refused while the agent wakes; retrying in ${delayMs}ms: ${err}`,
          ),
      },
    );
    if (created.id !== mission.conversationId) {
      await getEngine().updateActivity(agent.folderPath, created.id, {
        session_key: mission.sessionKey,
      });
    }
    return created.id;
  } catch (e) {
    // The deferred engine-call surface for the final attempt: the log line,
    // the quiet class or the capture, exactly as `createWithId` would have.
    await surfaceEngineError("create_activity", e, undefined, {
      toast: false,
      silence: isAgentGoneError,
    });
    // The agent vanished under the send (deleted/unshared elsewhere): an
    // expected roster-stale state, healed like the warming flush does — not a
    // bug toast the user can't act on.
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

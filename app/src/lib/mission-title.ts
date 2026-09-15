import { getEngine } from "./engine";
import { logger } from "./logger";
import {
  cleanGeneratedTitle,
  fallbackMissionTitle,
} from "./mission-title-text";

export { fallbackMissionTitle } from "./mission-title-text";

export interface RefreshMissionTitleOptions {
  agentPath: string;
  activityId: string;
  text: string;
}

/**
 * Replace a mission's truncated fallback title with the engine's summary. The
 * title turn runs on the agent's own runtime, which routes it to the provider
 * the conversation is already on — the caller has no say in the model.
 */
export async function refreshMissionTitle({
  agentPath,
  activityId,
  text,
}: RefreshMissionTitleOptions): Promise<void> {
  const fallback = fallbackMissionTitle(text);
  try {
    const summary = await getEngine().summarizeActivity(text, { agentPath });
    const title = cleanGeneratedTitle(summary.title) ?? fallback;
    if (title === fallback) return;
    await getEngine().updateActivity(agentPath, activityId, { title });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `[mission-title] keeping fallback title for ${activityId}`,
      message,
    );
  }
}

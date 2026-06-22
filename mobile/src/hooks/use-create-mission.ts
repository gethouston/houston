import type { Activity } from "@houston-ai/engine-client";
import { useMutation } from "@tanstack/react-query";
import { getEngine } from "../lib/engine";
import { dropPending, pushPending } from "./chat-optimistic";

const TITLE_MAX = 40;

export function autoTitleFromText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "New mission";
  if (trimmed.length <= TITLE_MAX) return trimmed;
  const slice = trimmed.slice(0, TITLE_MAX);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${base.trimEnd()}...`;
}

export interface CreateMissionResult {
  activity: Activity;
  sessionKey: string;
}

export function useCreateMission(agentPath: string) {
  return useMutation({
    mutationFn: async (prompt: string): Promise<CreateMissionResult> => {
      const trimmed = prompt.trim();
      const activity = await getEngine().createActivity(agentPath, {
        title: autoTitleFromText(trimmed),
        description: trimmed,
      });
      const sessionKey = `activity-${activity.id}`;
      const pendingId = pushPending(sessionKey, trimmed);
      try {
        await getEngine().startSession(agentPath, {
          sessionKey,
          prompt: trimmed,
        });
      } catch (e) {
        dropPending(sessionKey, pendingId);
        await getEngine()
          .deleteActivity(agentPath, activity.id)
          .catch((cleanupErr) => {
            console.error("[create-mission] rollback failed", cleanupErr);
          });
        throw e;
      }
      return { activity, sessionKey };
    },
  });
}

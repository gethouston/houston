import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConnectedProviders } from "../../hooks/use-connected-providers";
import { analytics } from "../../lib/analytics";
import { connectedProviderIds } from "../../lib/connected-providers";
import { createMission } from "../../lib/create-mission";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import {
  encodeSkillModifyMessage,
  encodeSkillSetupMessage,
} from "../../lib/skill-chat-prompts";
import { SKILL_SETUP_AGENT_MODE } from "../../lib/skill-chat-setup";
import { tauriActivity, tauriSkillDrafts } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import { readAgentRunOverrides } from "./routine-run-overrides";

export function useSkillChatWrites(agent: Agent) {
  const { t } = useTranslation("skills");
  const path = agent.folderPath;
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const connectedProvidersRef = useRef<readonly string[] | null>(null);
  connectedProvidersRef.current = connectedProviderIds(useConnectedProviders());

  const mode = SKILL_SETUP_AGENT_MODE;
  const missionTitle = t("setupChat.missionTitle");

  const startDraft = useCallback(async () => {
    if (pending) return null;
    setPending(true);
    try {
      const { conversationId } = await createMission(agent, "", {
        title: missionTitle,
        agentMode: mode,
        ...(await readAgentRunOverrides(path, connectedProvidersRef.current)),
        modeOverride: "execute",
        kickoffPrompt: (activityId) => encodeSkillSetupMessage(activityId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("skill_chat_setup_started");
      return conversationId;
    } catch {
      return null;
    } finally {
      setPending(false);
    }
  }, [agent, path, pending, queryClient, missionTitle]);

  const startForSkill = useCallback(
    async (skill: SkillSummary) => {
      if (pending) return false;
      setPending(true);
      try {
        const { conversationId } = await createMission(
          agent,
          encodeSkillModifyMessage({
            slug: skill.name,
            displayName: skillDisplayTitle(skill),
          }),
          {
            title: skillDisplayTitle(skill),
            agentMode: mode,
            ...(await readAgentRunOverrides(
              path,
              connectedProvidersRef.current,
            )),
            modeOverride: "execute",
          },
        );
        try {
          await tauriActivity.update(path, conversationId, {
            skill_slug: skill.name,
          });
        } catch (err) {
          logger.error(`[skill-chat] link stamp failed, retiring chat: ${err}`);
          await tauriActivity
            .update(path, conversationId, { status: "archived" })
            .catch((cleanupErr) =>
              logger.error(`[skill-chat] orphan cleanup failed: ${cleanupErr}`),
            );
          throw err;
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        return true;
      } catch {
        return false;
      } finally {
        setPending(false);
      }
    },
    [agent, path, pending, queryClient],
  );

  const archiveDraft = useCallback(
    async (activityId: string) => {
      if (pending) return false;
      setPending(true);
      try {
        await tauriSkillDrafts.discard(path, activityId);
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        return true;
      } catch (err) {
        logger.error(`[skill-chat] discard failed: ${err}`);
        return false;
      } finally {
        setPending(false);
      }
    },
    [path, pending, queryClient],
  );

  return { startDraft, startForSkill, archiveDraft, pending };
}

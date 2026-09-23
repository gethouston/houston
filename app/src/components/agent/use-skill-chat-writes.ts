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

/**
 * The writes behind a skill's setup chat: starting one, and retiring one.
 *
 * One start at a time across all three, so a double click can never leave two
 * conversations where the user asked for one.
 */
export function useSkillChatWrites(agent: Agent) {
  const { t } = useTranslation("skills");
  const path = agent.folderPath;
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  // Which providers the user is actually signed into — the kickoff turn must
  // run on one of them, never on an agent-configured provider they never
  // connected (PRODUCT-1236). `null` = could not confirm, so the pin defers to
  // the stored provider. Held in a ref so the start callbacks read the latest
  // scan without re-creating on every status refetch.
  const connectedProvidersRef = useRef<readonly string[] | null>(null);
  connectedProvidersRef.current = connectedProviderIds(useConnectedProviders());

  const mode = SKILL_SETUP_AGENT_MODE;
  const missionTitle = t("setupChat.missionTitle");

  /**
   * Start a create-chat on a fresh conversation, and answer with its activity
   * id (null on failure) so the caller can open it right away. The primitive
   * creates; the surface decides whether an unfinished chat is picked back up
   * instead.
   */
  const startDraft = useCallback(async () => {
    if (pending) return null;
    setPending(true);
    try {
      // The kickoff needs the activity's own id (the agent writes it into the
      // skill's `setup_activity_id`), so the prompt is built after create.
      const { conversationId } = await createMission(agent, "", {
        title: missionTitle,
        agentMode: mode,
        // Pin the agent's configured brain onto the kickoff turn, gated on
        // what the user has actually connected (see helper).
        ...(await readAgentRunOverrides(path, connectedProvidersRef.current)),
        // Setup chats always run as Ask first: the interview needs ask_user
        // (auto strips it) and must never open read-only in Planner.
        modeOverride: "execute",
        kickoffPrompt: (activityId) => encodeSkillSetupMessage(activityId),
      });
      // createMission bypasses useCreateActivity — refetch so the chat
      // view's backing activity exists before it tries to render.
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
      analytics.track("skill_chat_setup_started");
      return conversationId;
    } catch {
      // Every failure path here surfaces via call() (activity create's
      // read/write, the session send) — a toast here would double up.
      return null;
    } finally {
      setPending(false);
    }
  }, [agent, path, pending, queryClient, missionTitle]);

  /**
   * Start the persistent chat for a skill that doesn't have one yet, and
   * stamp the durable reverse link so every future open resumes it. (The
   * forward frontmatter link stays agent-owned; the client never rewrites
   * SKILL.md, so a concurrent agent edit can't be clobbered.)
   */
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
            // Same brain pin as startDraft, and the same Ask first pin —
            // setup chats are interactive by design.
            ...(await readAgentRunOverrides(
              path,
              connectedProvidersRef.current,
            )),
            modeOverride: "execute",
          },
        );
        try {
          // The durable direction: agents never rewrite activity.json.
          await tauriActivity.update(path, conversationId, {
            skill_slug: skill.name,
          });
        } catch (err) {
          // The chat exists but the link write failed: archive it so it can
          // never linger as a bogus "draft" row on the Custom tab (the heal's
          // title-match adoption is a repair, not a license to leak).
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
        // Every failure path here surfaces via call() (createMission's
        // read/write/send, the link write) — a toast here would double up.
        return false;
      } finally {
        setPending(false);
      }
    },
    [agent, path, pending, queryClient],
  );

  /**
   * Retire an unfinished create-chat, and answer whether it is really gone.
   * The caller starts a replacement on that answer alone: a fresh chat beside
   * an archive that failed is a second unfinished chat.
   */
  const archiveDraft = useCallback(
    async (activityId: string) => {
      if (pending) return false;
      setPending(true);
      try {
        await tauriSkillDrafts.discard(path, activityId);
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        return true;
      } catch (err) {
        // call() already toasted the failure; log so the rejection isn't silent.
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

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import {
  claimedSkillSlug,
  claimNewlyCreatedSkill,
} from "../../lib/skill-chat-setup";
import { tauriActivity } from "../../lib/tauri";
import type { Agent, SkillSummary } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import type { useSkillChatSetup } from "./use-skill-chat-setup";

export type SkillChatSelection =
  | { kind: "draft"; activityId: string | null }
  | { kind: "skill"; slug: string };

export function useSkillSetupView(
  agent: Agent,
  skills: SkillSummary[] | undefined,
  chatSetup: ReturnType<typeof useSkillChatSetup>,
) {
  const [selected, setSelected] = useState<SkillChatSelection | null>(null);
  const queryClient = useQueryClient();

  const [trackedAgentId, setTrackedAgentId] = useState(agent.id);
  if (trackedAgentId !== agent.id) {
    setTrackedAgentId(agent.id);
    setSelected(null);
  }

  const pendingActivityId = useUIStore((s) => s.pendingSkillChatActivityId);
  const setPendingSkillChatActivityId = useUIStore(
    (s) => s.setPendingSkillChatActivityId,
  );
  useEffect(() => {
    if (!pendingActivityId || !chatSetup.activitiesSettled) return;
    const activity = chatSetup.activityById(pendingActivityId);
    setPendingSkillChatActivityId(null);
    if (!activity || activity.status === "archived") return;
    const slug = activity.skill_slug ?? claimedSkillSlug(activity.id, skills);
    if (slug) setSelected({ kind: "skill", slug });
    else setSelected({ kind: "draft", activityId: activity.id });
  }, [pendingActivityId, skills, chatSetup, setPendingSkillChatActivityId]);

  useEffect(() => {
    if (selected?.kind !== "draft" || !selected.activityId) return;
    const slug = claimedSkillSlug(selected.activityId, skills);
    if (slug) setSelected({ kind: "skill", slug });
  }, [selected, skills]);

  const prevSlugsRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const prev = prevSlugsRef.current;
    if (skills !== undefined)
      prevSlugsRef.current = new Set(skills.map((s) => s.name));
    if (!prev || selected?.kind !== "draft" || !selected.activityId) return;
    const activityId = selected.activityId;
    const slug = claimNewlyCreatedSkill(prev, skills, chatSetup.activities);
    if (!slug) return;
    setSelected({ kind: "skill", slug });
    tauriActivity
      .update(agent.folderPath, activityId, { skill_slug: slug })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.activity(agent.folderPath),
        }),
      )
      .catch((err) =>
        logger.error(`[skill-chat] fallback claim stamp failed: ${err}`),
      );
  }, [selected, skills, chatSetup.activities, agent.folderPath, queryClient]);

  const startCreate = useCallback(async () => {
    setSelected({ kind: "draft", activityId: null });
    analytics.track("skill_chat_create_clicked");
    const activityId = await chatSetup.startDraft();
    setSelected((s) =>
      s?.kind === "draft" && s.activityId === null
        ? activityId
          ? { kind: "draft", activityId }
          : null
        : s,
    );
  }, [chatSetup]);

  const openSkillChat = useCallback(
    (slug: string) => {
      if (selected?.kind === "skill" && selected.slug === slug) {
        setSelected(null);
        return;
      }
      setSelected({ kind: "skill", slug });
      const skill = skills?.find((s) => s.name === slug);
      if (skill && !chatSetup.activityFor(skill)) {
        void chatSetup.startForSkill(skill).then((ok) => {
          if (!ok)
            setSelected((s) =>
              s?.kind === "skill" && s.slug === slug ? null : s,
            );
        });
      }
    },
    [selected, skills, chatSetup],
  );

  const resumeDraft = useCallback(
    (activityId: string) => setSelected({ kind: "draft", activityId }),
    [],
  );

  const deselect = useCallback(() => setSelected(null), []);

  return {
    selected,
    startCreate,
    openSkillChat,
    resumeDraft,
    deselect,
  };
}

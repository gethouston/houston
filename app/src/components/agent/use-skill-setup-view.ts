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

/** Which chat — if any — owns the Skills surface's inline chat pane. */
export type SkillChatSelection =
  | { kind: "draft"; activityId: string | null }
  | { kind: "skill"; slug: string };

/**
 * The Skills surface's chat selection state machine (HOU-791, mirrors the
 * Routines section's `useRoutinesTabView`): which skill's setup chat — or
 * which unclaimed draft — is open, and the effects that move the cursor.
 */
export function useSkillSetupView(
  agent: Agent,
  skills: SkillSummary[] | undefined,
  chatSetup: ReturnType<typeof useSkillChatSetup>,
) {
  const [selected, setSelected] = useState<SkillChatSelection | null>(null);
  const queryClient = useQueryClient();

  // The surface is reused across agents; clear the selection on agent switch
  // so a chat never bleeds between agents' Skills sections.
  const [trackedAgentId, setTrackedAgentId] = useState(agent.id);
  if (trackedAgentId !== agent.id) {
    setTrackedAgentId(agent.id);
    setSelected(null);
  }

  // A session-finished notification lands as a one-shot activity id; select
  // its skill/draft chat, or clear a stale/foreign id once both data sources
  // have loaded.
  const pendingActivityId = useUIStore((s) => s.pendingSkillChatActivityId);
  const setPendingSkillChatActivityId = useUIStore(
    (s) => s.setPendingSkillChatActivityId,
  );
  useEffect(() => {
    if (!pendingActivityId || !chatSetup.activitiesLoaded) return;
    const activity = chatSetup.activityById(pendingActivityId);
    setPendingSkillChatActivityId(null);
    if (!activity || activity.status === "archived") return;
    // The durable reverse stamp names the skill without waiting on the skills
    // list; an unstamped chat opens as its claiming skill (forward link) or as
    // a resumable draft — the claim effect below swaps it once skills load.
    const slug = activity.skill_slug ?? claimedSkillSlug(activity.id, skills);
    if (slug) setSelected({ kind: "skill", slug });
    else setSelected({ kind: "draft", activityId: activity.id });
  }, [pendingActivityId, skills, chatSetup, setPendingSkillChatActivityId]);

  // Draft → claimed: when the agent creates the skill (its frontmatter
  // pointing back at the draft chat), swap the selection to the skill's chat
  // so the SAME conversation continues seamlessly in the same pane.
  useEffect(() => {
    if (selected?.kind !== "draft" || !selected.activityId) return;
    const slug = claimedSkillSlug(selected.activityId, skills);
    if (slug) setSelected({ kind: "skill", slug });
  }, [selected, skills]);

  // Claim FALLBACK: an agent that forgot the frontmatter link would strand
  // the draft forever ("Meeting prep" showing both installed AND in
  // progress). While the user sits in a draft chat, the one skill that newly
  // appears with no link and no chat of its own is this conversation's
  // creation — stamp the durable link ourselves and swap.
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
    // Deliberately NO org-share default (HOU-1192) here: this claim is a
    // list-delta heuristic, and the catalog stays interactive beside a draft
    // chat — a store/GitHub install landing during the chat can satisfy it,
    // and installs are specified as agent-scoped. Only the heal's forward-
    // link stamp (provenance the agent itself wrote) triggers the share.
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

  // "Create with AI": open the calm creating surface instantly, then swap in
  // the draft's id (or clear the selection on failure) once the start lands —
  // but only if the user is still waiting on this create.
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

  // Skill row click: open the skill's chat (starting one first if it lacks
  // one), or close it when it is already the open one (re-click). A failed
  // start clears the selection so it never strands the user.
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

  // Abandon a draft: archive its chat so it stops showing as a resumable
  // item. Failures surface via call()'s own toast path.
  const discardDraft = useCallback(
    (activityId: string) => {
      setSelected((s) =>
        s?.kind === "draft" && s.activityId === activityId ? null : s,
      );
      tauriActivity
        .update(agent.folderPath, activityId, { status: "archived" })
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.activity(agent.folderPath),
          }),
        )
        // call() already toasted the failure; log so the rejection isn't silent.
        .catch((err) => logger.error(`[skill-chat] discard failed: ${err}`));
    },
    [agent.folderPath, queryClient],
  );

  const deselect = useCallback(() => setSelected(null), []);

  return {
    selected,
    startCreate,
    openSkillChat,
    resumeDraft,
    discardDraft,
    deselect,
  };
}

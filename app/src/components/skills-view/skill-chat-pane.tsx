import { discardDraftThenRestart } from "@houston/sdk/skill-drafts";
import { useEffect, useRef } from "react";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { Agent, SkillSummary } from "../../lib/types";
import { SkillSetupChat } from "../agent/skill-setup-chat";
import { useSkillChatSetup } from "../agent/use-skill-chat-setup";
import { useSkillSetupView } from "../agent/use-skill-setup-view";
import { type SkillChatIntent, useSkillChatOpen } from "./use-skill-chat-open";

export type { SkillChatIntent };

/**
 * The Skills surface's chat: mounts the per-agent setup-chat machinery
 * (HOU-791) for the agent it was handed and opens what it was asked for
 * ({@link useSkillChatOpen}) — a create chat, or an existing skill's own
 * conversation when its editor opens. The chat renders in the shell's
 * right-hand panel (via {@link SkillSetupChat}) while the list or editor stays
 * on the left; the draft→skill claim swap keeps the same conversation running
 * once the agent writes the SKILL.md. Closing the pane (X / Escape) unmounts
 * this via `onClose`.
 */
export function SkillChatPane({
  agent,
  skills,
  skillsFailed,
  initial,
  onClose,
  onEditSkill,
  onOpenActivityChange,
}: {
  /** The agent the chat runs on — a created skill lands there first. */
  agent: Agent;
  /** That agent's current skill list (drives the draft→skill claim swap). */
  skills: SkillSummary[] | undefined;
  /** Whether reading the skills failed: the list never arrives, so a decision
   *  waiting on it has to stop waiting. */
  skillsFailed: boolean;
  /** What to open: the create chat (which may pick an unfinished one back up),
   *  ONE unfinished chat by id, or an EXISTING skill's chat. */
  initial: SkillChatIntent;
  onClose: () => void;
  /** The chat header's "Edit manually" for a claimed skill — shows that
   *  skill's markdown in the editor on the left. */
  onEditSkill: (slug: string) => void;
  /** The unclaimed chat this pane holds, so the list beside it never draws a
   *  second row for the very conversation already on screen. */
  onOpenActivityChange: (activityId: string | null) => void;
}) {
  const chatSetup = useSkillChatSetup(agent, skills);
  const view = useSkillSetupView(agent, skills, chatSetup);
  const { selected, startCreate, openSkillChat, resumeDraft } = view;
  const { activitiesSettled, activitiesFailed, archiveDraft, draftActivities } =
    chatSetup;

  const { deciding } = useSkillChatOpen({
    initial,
    // Which chats are still unfinished is read from both lists, so both must
    // be this agent's own settled answer.
    settled: activitiesSettled && skills !== undefined,
    failed: activitiesFailed || skillsFailed,
    drafts: draftActivities,
    openSkillChat,
    resumeDraft,
    startCreate,
    onMissingDraft: onClose,
  });

  // An open draft is unclaimed until the agent writes the skill, so the list
  // beside this pane would otherwise draw a row for it too.
  const openDraftId = selected?.kind === "draft" ? selected.activityId : null;
  useEffect(() => {
    onOpenActivityChange(openDraftId);
    return () => onOpenActivityChange(null);
  }, [openDraftId, onOpenActivityChange]);

  // The selection clearing AFTER it was seen non-null means the chat was
  // closed (pane X, Escape) or the start failed — either way this host is
  // done. Guarded on an observed selection: on the mount commit this effect
  // runs while `selected` is still null (startCreate's set lands next
  // render), and closing then would tear the chat down before it ever opened.
  const sawSelectionRef = useRef(false);
  useEffect(() => {
    if (selected !== null) {
      sawSelectionRef.current = true;
      return;
    }
    if (sawSelectionRef.current) onClose();
  }, [selected, onClose]);

  if (selected === null && deciding)
    return (
      <SkillSetupChat
        agent={agent}
        activity={null}
        kind="draft"
        // Nothing is selected yet, so clearing the selection would close
        // nothing: this surface dismisses the pane itself.
        onClose={onClose}
      />
    );
  if (selected?.kind === "draft") {
    const draftId = selected.activityId;
    const activity = draftId
      ? (draftActivities.find((a) => a.id === draftId) ?? null)
      : null;
    return (
      <SkillSetupChat
        agent={agent}
        activity={activity}
        kind="draft"
        onClose={view.deselect}
        // Throwing this one away IS starting over: the chat the user opened
        // stays open, on a fresh conversation — and only once the old one is
        // really gone.
        onDiscardDraft={
          draftId === null
            ? undefined
            : () =>
                void discardDraftThenRestart({
                  archive: () => archiveDraft(draftId),
                  startNew: () => void startCreate(),
                })
        }
      />
    );
  }
  if (selected?.kind === "skill") {
    // The claimed skill may have just left the agent-LOCAL list this prop
    // carries: the org-share default (HOU-1192) moves a freshly created skill
    // into the workspace store moments after the claim. The conversation must
    // survive that move, so a miss falls back to a minimal row — the chat
    // resolves its activity by the durable reverse stamp anyway.
    const skill: SkillSummary = skills?.find(
      (s) => s.name === selected.slug,
    ) ?? {
      name: selected.slug,
      title: null,
      description: "",
      version: 1,
      tags: [],
      created: null,
      last_used: null,
      category: null,
      featured: false,
      integrations: [],
      image: null,
      setup_activity_id: null,
      inputs: [],
      prompt_template: null,
    };
    return (
      <SkillSetupChat
        agent={agent}
        activity={chatSetup.activityFor(skill)}
        kind="skill"
        skillName={skillDisplayTitle(skill)}
        skillSlug={skill.name}
        onClose={view.deselect}
        onEditManually={() => onEditSkill(skill.name)}
      />
    );
  }
  return null;
}

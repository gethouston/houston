import type { Activity } from "@houston-ai/engine-client";
import { type ReactNode, useEffect } from "react";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { Agent, SkillSummary } from "../../lib/types";
import { SkillSetupChat } from "./skill-setup-chat";
import { useSkillChatSetup } from "./use-skill-chat-setup";
import { useSkillSetupView } from "./use-skill-setup-view";

/**
 * The Skills surface's chat layer (HOU-791): glues the setup-chat lifecycle
 * (`useSkillChatSetup`) and the selection machine (`useSkillSetupView`) into
 * what {@link SkillsContent} renders — the inline chat pane for the open
 * selection, the row-click handler that opens a skill's chat, and the Custom
 * tab's create/draft affordances. Disabled (null chat, rows fall back to the
 * manual edit modal) in read-only mode.
 */
export function useSkillsChatSurface(opts: {
  agent: Agent;
  skills: SkillSummary[];
  /** Whether the skills list is still loading — gates the ghost-skill
   *  deselect so an in-flight (empty) list never closes an open chat. */
  loading: boolean;
  readOnly: boolean;
  /** Opens the manual markdown edit modal (the read-only fallback, and the
   *  chat header's "Edit manually" escape hatch). */
  onEditSkill: (name: string) => void;
}): {
  /** The open chat pane, or null when nothing is selected. */
  chatNode: ReactNode | null;
  /** Row click: the skill's chat (writable) or the manual modal (read-only). */
  openRow: (name: string) => void;
  /** Unclaimed create-chats, shown as resumable rows on the Custom tab. */
  drafts: Activity[];
  resumeDraft: (activityId: string) => void;
  discardDraft: (activityId: string) => void;
  startCreate: () => void;
} {
  const { agent, skills, loading, readOnly, onEditSkill } = opts;
  const chatSetup = useSkillChatSetup(agent, skills);
  const view = useSkillSetupView(agent, skills, chatSetup);
  const { selected, deselect } = view;

  // A skill deleted while its chat is open (edit modal's delete, an agent
  // cleanup): close the pane instead of stranding a chat for a ghost skill.
  // Gated on a loaded list — an in-flight fetch reads as [] and must not
  // close the chat it is about to re-confirm.
  const selectedSkill =
    selected?.kind === "skill"
      ? (skills.find((s) => s.name === selected.slug) ?? null)
      : null;
  useEffect(() => {
    if (!loading && selected?.kind === "skill" && !selectedSkill) deselect();
  }, [loading, selected, selectedSkill, deselect]);

  if (readOnly) {
    return {
      chatNode: null,
      openRow: onEditSkill,
      drafts: [],
      resumeDraft: () => {},
      discardDraft: () => {},
      startCreate: () => {},
    };
  }

  let chatNode: ReactNode | null = null;
  if (selected?.kind === "skill" && selectedSkill) {
    chatNode = (
      <SkillSetupChat
        agent={agent}
        activity={chatSetup.activityFor(selectedSkill)}
        kind="skill"
        skillName={skillDisplayTitle(selectedSkill)}
        onClose={deselect}
        onEditManually={() => onEditSkill(selectedSkill.name)}
      />
    );
  } else if (selected?.kind === "draft") {
    const activity = selected.activityId
      ? (chatSetup.draftActivities.find((a) => a.id === selected.activityId) ??
        null)
      : null;
    chatNode = (
      <SkillSetupChat
        agent={agent}
        activity={activity}
        kind="draft"
        onClose={deselect}
      />
    );
  }

  return {
    chatNode,
    openRow: view.openSkillChat,
    drafts: chatSetup.draftActivities,
    resumeDraft: view.resumeDraft,
    discardDraft: view.discardDraft,
    startCreate: () => void view.startCreate(),
  };
}

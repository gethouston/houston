import { discardDraftThenRestart } from "@houston/sdk/skill-drafts";
import { useEffect, useRef } from "react";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { Agent, SkillSummary } from "../../lib/types";
import { SkillSetupChat } from "../agent/skill-setup-chat";
import { useSkillChatSetup } from "../agent/use-skill-chat-setup";
import { useSkillSetupView } from "../agent/use-skill-setup-view";
import { type SkillChatIntent, useSkillChatOpen } from "./use-skill-chat-open";

export type { SkillChatIntent };

export function SkillChatPane({
  agent,
  skills,
  skillsFailed,
  initial,
  onClose,
  onEditSkill,
  onOpenActivityChange,
}: {
  agent: Agent;
  skills: SkillSummary[] | undefined;
  skillsFailed: boolean;
  initial: SkillChatIntent;
  onClose: () => void;
  onEditSkill: (slug: string) => void;
  onOpenActivityChange: (activityId: string | null) => void;
}) {
  const chatSetup = useSkillChatSetup(agent, skills);
  const view = useSkillSetupView(agent, skills, chatSetup);
  const { selected, startCreate, openSkillChat, resumeDraft } = view;
  const { activitiesSettled, activitiesFailed, archiveDraft, draftActivities } =
    chatSetup;

  const { deciding } = useSkillChatOpen({
    initial,
    settled: activitiesSettled && skills !== undefined,
    failed: activitiesFailed || skillsFailed,
    drafts: draftActivities,
    openSkillChat,
    resumeDraft,
    startCreate,
    onMissingDraft: onClose,
  });

  const openDraftId = selected?.kind === "draft" ? selected.activityId : null;
  useEffect(() => {
    onOpenActivityChange(openDraftId);
    return () => onOpenActivityChange(null);
  }, [openDraftId, onOpenActivityChange]);

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

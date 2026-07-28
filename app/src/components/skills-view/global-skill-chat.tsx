import { useEffect, useRef } from "react";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { Agent, SkillSummary } from "../../lib/types";
import { SkillSetupChat } from "../tabs/skill-setup-chat";
import { useSkillChatSetup } from "../tabs/use-skill-chat-setup";
import { useSkillSetupView } from "../tabs/use-skill-setup-view";

/**
 * The global Skills page's create-with-AI chat (HOU-792): mounts the same
 * per-agent setup-chat machinery (HOU-791) for the PICKED agent and starts a
 * fresh create draft immediately. The chat renders in the shell's right-hand
 * panel (via {@link SkillSetupChat}) while the global page stays on the left;
 * the draft→skill claim swap keeps the same conversation running once the
 * agent writes the SKILL.md. Closing the pane (X / Escape) unmounts this via
 * `onClose`.
 */
export function GlobalSkillChat({
  agent,
  skills,
  onClose,
  onEditSkill,
}: {
  /** The agent the chat runs on — the skill is created there first. */
  agent: Agent;
  /** That agent's current skill list (drives the draft→skill claim swap). */
  skills: SkillSummary[] | undefined;
  onClose: () => void;
  /** The chat header's "Edit manually" for a claimed skill — opens the
   *  global manage dialog. */
  onEditSkill: (slug: string) => void;
}) {
  const chatSetup = useSkillChatSetup(agent, skills);
  const view = useSkillSetupView(agent, skills, chatSetup);
  const { selected, startCreate } = view;

  // Kick off exactly one fresh create draft per mount (the host keys this
  // component per open, so "New skill" always means new).
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startCreate();
  }, [startCreate]);

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

  if (selected?.kind === "draft") {
    const activity = selected.activityId
      ? (chatSetup.draftActivities.find((a) => a.id === selected.activityId) ??
        null)
      : null;
    return (
      <SkillSetupChat
        agent={agent}
        activity={activity}
        kind="draft"
        onClose={view.deselect}
      />
    );
  }
  if (selected?.kind === "skill") {
    const skill = skills?.find((s) => s.name === selected.slug);
    if (!skill) return null;
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

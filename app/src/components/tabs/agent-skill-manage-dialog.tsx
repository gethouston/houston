import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { useAgentStore } from "../../stores/agents";
import { ManageSkillDialog } from "../skills-view/manage-skill-dialog";
import { useSkillsViewActions } from "../skills-view/use-skills-view-actions";
import { useWorkspaceSkills } from "../skills-view/use-workspace-skills";

/**
 * The per-agent Skills tab's skill dialog (HOU-792): the SAME manage dialog
 * the global page opens — content, "Agents with this skill" assignment, Edit
 * in chat, Delete — resolved for one clicked slug. Rendered only while a
 * skill is open, so the cross-agent aggregation (one request per agent;
 * hosted mode wakes pods) runs only for an open dialog; until every list has
 * answered the dialog stays closed rather than showing a wrong holder set.
 *
 * The CURRENT agent is pinned first among the holders, so the content shown
 * (and copied to newly assigned agents) is THIS agent's copy — on the tab of
 * Agent B you edit Agent B's version, never a divergent sibling's.
 */
export function AgentSkillManageDialog({
  agent,
  slug,
  onClose,
  onEditInChat,
}: {
  agent: Agent;
  /** The open skill's directory slug. */
  slug: string;
  onClose: () => void;
  /** "Edit in chat" — opens the skill's setup chat in the side panel. */
  onEditInChat: (slug: string) => void;
}) {
  const agents = useAgentStore((s) => s.agents);
  const { rows, loading } = useWorkspaceSkills(agents);
  const actions = useSkillsViewActions();

  const row = useMemo<WorkspaceSkillRow | null>(() => {
    if (loading) return null;
    const found = rows.find((r) => r.slug === slug);
    if (!found) return null;
    const holdsHere = found.agents.some((a) => a.id === agent.id);
    if (!holdsHere) return found;
    return {
      ...found,
      agents: [
        found.agents.find((a) => a.id === agent.id) ?? found.agents[0],
        ...found.agents.filter((a) => a.id !== agent.id),
      ],
    };
  }, [rows, loading, slug, agent.id]);

  return (
    <ManageSkillDialog
      row={row}
      agents={agents}
      onApply={actions.applySkillChanges}
      onDeleteEverywhere={actions.deleteSkillEverywhere}
      onClose={onClose}
      onEditInChat={(open) => onEditInChat(open.slug)}
    />
  );
}

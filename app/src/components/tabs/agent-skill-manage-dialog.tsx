import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import type { WorkspaceSkillRow } from "../../lib/workspace-skills";
import { ManageSkillDialog } from "../skills-view/manage-skill-dialog";
import { useSkillsViewActions } from "../skills-view/use-skills-view-actions";
import { useWorkspaceSkills } from "../skills-view/use-workspace-skills";

/**
 * The per-agent Skills tab's skill dialog (HOU-792): the shared manage dialog
 * scoped to ONE agent — content editing, Edit in chat, Delete, and no "Agents
 * with this skill" section. Cross-agent assignment lives ONLY on the global
 * Skills page; here Save writes THIS agent's copy and Delete removes it from
 * this agent alone. The scoping also means only this agent's skill list is
 * fetched — never the workspace-wide fan-out (which, in hosted mode, woke a
 * pod per agent just to render a holder list this dialog no longer shows).
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
  const scope = useMemo(() => [agent], [agent]);
  const { rows, loading } = useWorkspaceSkills(scope);
  const actions = useSkillsViewActions();

  const row = useMemo<WorkspaceSkillRow | null>(() => {
    if (loading) return null;
    return rows.find((r) => r.slug === slug) ?? null;
  }, [rows, loading, slug]);

  return (
    <ManageSkillDialog
      row={row}
      agents={scope}
      hideAssignment
      onApply={actions.applySkillChanges}
      onDeleteEverywhere={actions.deleteSkillEverywhere}
      onClose={onClose}
      onEditInChat={(open) => onEditInChat(open.slug)}
    />
  );
}

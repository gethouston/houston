import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import type { ManagedSkillRow } from "../skills-view/manage-skill-dialog";
import { ManageSkillDialog } from "../skills-view/manage-skill-dialog";
import { useSharedSkillsActions } from "../skills-view/use-shared-skills-actions";
import { useSkillsViewActions } from "../skills-view/use-skills-view-actions";
import { useWorkspaceSkills } from "../skills-view/use-workspace-skills";
import { useAgentSharedSkills } from "./use-agent-shared-skills";

/**
 * The agent settings page's Skills dialog (HOU-792): the shared manage dialog
 * scoped to ONE agent — content editing, Edit in chat, and no "Agents with
 * this skill" section (cross-agent assignment lives ONLY on the global Skills
 * page). A LOCAL skill's Save writes this agent's copy and Delete removes it
 * from this agent alone. A WORKSPACE-STORE skill this agent enables (ADR
 * 0003) opens the same dialog: Save is one store write — an edit of the
 * original, every agent gets it — and the danger action becomes "Disable for
 * this agent", a reversible manifest write. The scoping also means only this
 * agent's skill list is fetched — never the workspace-wide fan-out.
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
  const shared = useAgentSharedSkills(agent.folderPath);
  const actions = useSkillsViewActions();
  const sharedActions = useSharedSkillsActions(shared.workspaceId);

  const row = useMemo<ManagedSkillRow | null>(() => {
    if (loading) return null;
    const local = rows.find((r) => r.slug === slug);
    if (local) return local;
    // No local copy: a store skill this agent's manifest enables — manage
    // the ONE workspace copy, scoped to this agent.
    const summary = shared.items.find((s) => s.name === slug);
    if (!summary || !shared.activeSlugs.has(slug)) return null;
    return {
      slug,
      summary,
      origin: "shared",
      agents: [agent],
      overriddenBy: [],
    };
  }, [rows, loading, slug, shared.items, shared.activeSlugs, agent]);

  const isShared = row?.origin === "shared";
  return (
    <ManageSkillDialog
      row={row}
      agents={scope}
      hideAssignment
      onApply={actions.applySkillChanges}
      onDeleteEverywhere={actions.deleteSkillEverywhere}
      onClose={onClose}
      onEditInChat={(open) => onEditInChat(open.slug)}
      shared={
        isShared && shared.workspaceId !== null
          ? {
              workspaceId: shared.workspaceId,
              onApply: sharedActions.applyShared,
              // Assignment is hidden here, so only onApply (content save) and
              // the disable path below are reachable; the rest satisfy the
              // contract with their real implementations.
              onDelete: (r) => sharedActions.deleteShared(r, scope),
              onRevert: sharedActions.revertOverride,
              onEnableAll: (r) => sharedActions.enableForAll(r, scope),
              onPromote: sharedActions.promoteToShared,
            }
          : undefined
      }
      onDisableForAgent={isShared ? () => shared.disable(slug) : undefined}
    />
  );
}

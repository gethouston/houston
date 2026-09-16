import type { Agent } from "../../lib/types";
import { SkillAssignmentSection } from "./skill-assignment-section";
import type { SkillEditorState } from "./use-skill-editor";

/**
 * "Agents with this skill" under the editor's body — the same section the
 * manage dialog carried, in the same three modes, on its own card so the page
 * reads as the skill first and its reach second. Changes here are part of the
 * ONE Save above: assignment and content commit together, exactly as they did
 * in the dialog.
 */
export function SkillEditorAgentsCard({
  agents,
  editor,
}: {
  agents: Agent[];
  editor: SkillEditorState;
}) {
  return (
    <div className="ht-hairline rounded-xl bg-card p-4">
      <SkillAssignmentSection
        mode={editor.assignment}
        agents={agents}
        assignedIds={editor.assigned}
        selected={editor.selection}
        onToggle={editor.toggleAgent}
        allowEmptySelection={editor.isShared}
        onEnableAll={editor.onEnableAll}
        overrides={editor.overrides}
      />
    </div>
  );
}

import { AsyncButton, Button, DialogFooter } from "@houston-ai/core";
import { MessageCircle, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent, SkillWorkflow } from "../../lib/types";
import { SkillAssignmentSection } from "./skill-assignment-section";
import { SkillBodyEditor } from "./skill-body-editor";

/**
 * The ready-state body of the global skill dialog: the skill itself (its
 * workflow steps for a Houston-written skill, the SKILL.md editor for an
 * imported one — see {@link SkillBodyEditor}) over the agent assignment list.
 * Owns the draft state; mounted with a `key` per skill so switching rows
 * reseeds it. Save hands the parent the draft + whether the
 * content changed — the parent turns that into the write/delete fan-out.
 */
export function ManageSkillBody({
  initialContent,
  workflow,
  agents,
  assignedIds,
  allowEmptySelection = false,
  assignment = "editable",
  overrides,
  onEnableAll,
  onPromote,
  forceDirty = false,
  onSave,
  onDeleteEverywhere,
  deleteLabel,
  onCancel,
  onEditInChat,
}: {
  /** The canonical copy's full SKILL.md (frontmatter + body). */
  initialContent: string;
  workflow?: SkillWorkflow | null;
  agents: Agent[];
  /** Ids of the agents currently holding a copy. */
  assignedIds: ReadonlySet<string>;
  /** Store-backed rows may save with nobody enabled — the skill just rests
   *  in the workspace store (copy-based rows treat that as deletion). */
  allowEmptySelection?: boolean;
  /**
   * The "Agents with this skill" section's mode:
   * - `"editable"` — the toggle list (the global page's assignment).
   * - `"locked"` — holders read-only + a share hint: shared-store deployments
   *   never offer copy fan-out on a LOCAL row; multi-agent use goes through
   *   "Share to workspace" (ADR 0003).
   * - `"hidden"` — no section at all: the per-agent dialog edits ONLY that
   *   agent's copy; cross-agent management lives on the global Skills page.
   */
  assignment?: "editable" | "locked" | "hidden";
  /** Agents whose own modified copy shadows the workspace version. */
  overrides?: { agents: Agent[]; onRevert: (agent: Agent) => Promise<void> };
  /** One click enables every agent (store-backed rows only). */
  onEnableAll?: () => Promise<void>;
  /** Move this per-agent skill into the workspace store ("Share to
   *  workspace") — offered on local rows when the deployment has a store. */
  onPromote?: () => Promise<void>;
  /** Unsaved work living OUTSIDE this body — the dialog header's pending
   *  rename — so Save lights up even when the draft here is untouched. */
  forceDirty?: boolean;
  onSave: (draft: {
    content: string;
    contentDirty: boolean;
    afterIds: Set<string>;
  }) => Promise<void>;
  onDeleteEverywhere: () => void;
  /** Overrides the danger button's label (the per-agent shared dialog says
   *  "Disable for this agent" — the action is a reversible manifest write,
   *  not a delete). */
  deleteLabel?: string;
  onCancel: () => void;
  /** Open the skill's guided setup chat instead of editing raw markdown
   *  (HOU-791's primary edit path). Omit to hide the button. */
  onEditInChat?: () => void;
}) {
  const { t } = useTranslation(["skills", "common"]);
  const [content, setContent] = useState(initialContent);
  const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds));

  const contentDirty = content !== initialContent;
  const assignmentDirty =
    assignment === "editable" &&
    (selected.size !== assignedIds.size ||
      [...selected].some((id) => !assignedIds.has(id)));
  const dirty = contentDirty || assignmentDirty || forceDirty;
  // Copy-based rows: unassigning everyone IS deletion — that path goes through
  // the explicit Delete button, so an empty selection can't ride an
  // innocuous-looking Save. Store-backed rows keep the skill either way.
  const savable = dirty && (allowEmptySelection || selected.size > 0);

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <SkillBodyEditor
          variant="dialog"
          content={content}
          workflow={workflow}
          onChange={setContent}
        />
        {assignment !== "hidden" && (
          <SkillAssignmentSection
            mode={assignment}
            agents={agents}
            assignedIds={assignedIds}
            selected={selected}
            onToggle={(agent) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(agent.id)) next.delete(agent.id);
                else next.add(agent.id);
                return next;
              })
            }
            allowEmptySelection={allowEmptySelection}
            onEnableAll={
              onEnableAll
                ? async () => {
                    await onEnableAll();
                    setSelected(new Set(agents.map((a) => a.id)));
                  }
                : undefined
            }
            overrides={overrides}
          />
        )}
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          className="mr-auto text-danger hover:text-danger"
          onClick={onDeleteEverywhere}
        >
          {deleteLabel ?? t("common:actions.delete")}
        </Button>
        {onPromote && (
          <AsyncButton type="button" variant="outline" onClick={onPromote}>
            <Users className="size-4" />
            {t("skills:global.manage.shareToWorkspace")}
          </AsyncButton>
        )}
        {onEditInChat && (
          <Button type="button" variant="outline" onClick={onEditInChat}>
            <MessageCircle className="size-4" />
            {t("skills:global.manage.editInChat")}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <AsyncButton
          type="button"
          disabled={!savable}
          onClick={() => onSave({ content, contentDirty, afterIds: selected })}
        >
          {t("skills:detail.saveChanges")}
        </AsyncButton>
      </DialogFooter>
    </>
  );
}

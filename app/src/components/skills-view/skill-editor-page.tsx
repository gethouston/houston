import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { logAndReportError } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import { OrgLockedNote } from "../shell/org-locked-fieldset";
import { SkillBodyEditor } from "./skill-body-editor";
import { SkillEditorConfirms } from "./skill-editor-confirms";
import { SkillEditorHeader } from "./skill-editor-header";
import {
  resolveSkillEditorView,
  type SkillEditorView,
} from "./skill-editor-model";
import type {
  ManagedSkillRow,
  SharedDialogActions,
  SkillEditorActions,
} from "./skill-editor-props";
import { SkillEditorSaveRow } from "./skill-editor-save-row";
import { SkillOverrideNotice } from "./skill-override-notice";
import { SkillsSurfaceFrame } from "./skills-surface-frame";
import { useScopedSkillActs } from "./use-scoped-skill-acts";
import { useSkillEditor } from "./use-skill-editor";
import {
  type WorkspaceDeleteRequest,
  WorkspaceSkillMenuItems,
} from "./workspace-skill-menu-items";

export interface SkillEditorPageProps extends SkillEditorActions {
  /** The skill as this employee's section lists it. */
  row: ManagedSkillRow;
  /** Every AI Employee in the workspace, whom the menu's "for everyone" acts
   *  read and reach. */
  workspaceAgents: Agent[];
  /** The AI Employee whose Skills section this editor stands in. */
  agent: Agent;
  shared?: SharedDialogActions;
  /** The view the host pinned (the chat's "Edit manually"), or null for the
   *  skill's own default. */
  view: SkillEditorView | null;
  onViewChange: (view: SkillEditorView) => void;
  /** Back to the list. */
  onBack: () => void;
  /** Reopen the skill's chat; omitted while it is already on the glass. */
  onOpenChat?: () => void;
}

/**
 * One skill, full page: the workflow (or its markdown) on the left of the
 * shell's detail panel, which holds the skill's own chat. It takes the surface
 * in place of the list, header included: the editor's own back arrow is the
 * way back.
 *
 * Content and the pending rename commit in ONE save, to THIS employee's skill.
 * Its danger action is this employee's alone: on a workspace skill, "stop
 * loading it here" (a reversible manifest write); on a copy, deleting this
 * employee's copy. The acts that reach every employee (share, enable for all,
 * delete for all) sit in the header menu and run on the workspace row. A
 * locked org keeps the skill open to read and turns every write off.
 */
export function SkillEditorPage({
  row,
  workspaceAgents,
  agent,
  onApply,
  onDeleteEverywhere,
  shared,
  view,
  onViewChange,
  onBack,
  onOpenChat,
}: SkillEditorPageProps) {
  const { t } = useTranslation(["skills", "common"]);
  const { locked } = useOrgWriteLock();
  const editor = useSkillEditor({
    row,
    agent,
    onApply,
    onDeleteEverywhere,
    shared,
    onBack,
  });
  // The act a confirmed "discard changes" runs. Every way OUT of a dirty
  // editor goes through it, so none of them can drop typed work silently.
  const [pendingLeave, setPendingLeave] = useState<{ run: () => void } | null>(
    null,
  );
  const hasWorkflow = (editor.detail?.workflow?.steps.length ?? 0) > 0;
  const resolved = resolveSkillEditorView(view, hasWorkflow);

  const guard = (run: () => void) => {
    if (editor.dirty) setPendingLeave({ run });
    else run();
  };
  const scoped = useScopedSkillActs({
    row,
    scopedAgent: agent,
    shared,
    isShared: editor.isShared,
    guard,
    onBack,
  });
  const [deleteForEveryone, setDeleteForEveryone] =
    useState<WorkspaceDeleteRequest | null>(null);

  return (
    <SkillsSurfaceFrame
      dataAttrs={{ "data-testid": "skill-editor" }}
      contentClassName="flex flex-col gap-4"
      header={
        <SkillEditorHeader
          row={row}
          rename={editor.rename}
          onRename={editor.detail && !locked ? editor.setRename : undefined}
          view={resolved}
          onViewChange={onViewChange}
          onBack={() => guard(onBack)}
          onOpenChat={onOpenChat}
          workspaceItems={
            !locked && (
              <WorkspaceSkillMenuItems
                slug={row.slug}
                agent={agent}
                workspaceAgents={workspaceAgents}
                onDeleteEverywhere={onDeleteEverywhere}
                onBack={onBack}
                guard={guard}
                onRequestDelete={setDeleteForEveryone}
              />
            )
          }
          onDelete={scoped.disableHere ?? editor.flow.openConfirmDelete}
          deleteLabel={
            scoped.disableHere
              ? t("skills:global.manage.disableForAgent")
              : undefined
          }
          deleteDisabled={scoped.pending || locked}
        />
      }
    >
      <OrgLockedNote />
      {scoped.notice !== null && (
        <SkillOverrideNotice
          kind={scoped.notice}
          onUseWorkspaceVersion={scoped.useWorkspaceVersion}
          disabled={scoped.pending || locked}
        />
      )}
      <SkillBodyEditor
        view={resolved}
        onViewChange={onViewChange}
        editor={editor}
        readOnly={locked}
      />
      <SkillEditorSaveRow editor={editor} locked={locked} />
      <SkillEditorConfirms
        row={row}
        agent={agent}
        pendingLeave={pendingLeave !== null}
        onCancelLeave={() => setPendingLeave(null)}
        onConfirmLeave={() => {
          const run = pendingLeave?.run;
          setPendingLeave(null);
          run?.();
        }}
        deleteForEveryone={deleteForEveryone}
        onCancelDeleteForEveryone={() => setDeleteForEveryone(null)}
        onConfirmDeleteForEveryone={() => {
          const request = deleteForEveryone;
          setDeleteForEveryone(null);
          void request
            ?.run()
            .then(onBack)
            .catch((err: unknown) =>
              logAndReportError("skill_delete_for_everyone", err),
            );
        }}
        confirmDelete={editor.flow.confirmDelete}
        onCancelDelete={editor.flow.cancelConfirmDelete}
        onConfirmDelete={editor.flow.confirmDeleteNow}
        scopedAct={scoped.confirming}
        onCancelScopedAct={scoped.onCancelConfirm}
        onConfirmScopedAct={scoped.onConfirm}
      />
    </SkillsSurfaceFrame>
  );
}

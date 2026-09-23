import { AsyncButton, Button, ConfirmDialog } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { SkillBodyEditor } from "./skill-body-editor";
import { SkillEditorAgentsCard } from "./skill-editor-agents-card";
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
import { SkillOverrideNotice } from "./skill-override-notice";
import { type SkillsFrame, SkillsSurfaceFrame } from "./skills-surface-frame";
import { useScopedSkillActs } from "./use-scoped-skill-acts";
import { useSkillEditor } from "./use-skill-editor";

export interface SkillEditorPageProps extends SkillEditorActions {
  row: ManagedSkillRow;
  agents: Agent[];
  /** The one AI Employee this surface is scoped to, or null for the library. */
  scopedAgent: Agent | null;
  frame: SkillsFrame;
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
 * Content, the pending rename and the agent assignment commit in ONE save.
 * Scoped to a single AI Employee there is no assignment to make — the section
 * edits THAT employee's skill — so the card is dropped, and the danger action
 * on a workspace-shared skill becomes "stop loading it here", a reversible
 * manifest write rather than a delete of everyone's copy.
 */
export function SkillEditorPage({
  row,
  agents,
  scopedAgent,
  frame,
  onApply,
  onDeleteEverywhere,
  shared,
  view,
  onViewChange,
  onBack,
  onOpenChat,
}: SkillEditorPageProps) {
  const { t } = useTranslation(["skills", "common"]);
  const editor = useSkillEditor({
    row,
    agents,
    scopedAgent,
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
    scopedAgent,
    shared,
    isShared: editor.isShared,
    guard,
    onBack,
  });

  return (
    <SkillsSurfaceFrame
      frame={frame}
      dataAttrs={{ "data-testid": "skill-editor" }}
      padClassName="pt-2 pb-10"
      contentClassName="flex flex-col gap-4"
      header={
        <SkillEditorHeader
          row={row}
          frame={frame}
          rename={editor.rename}
          onRename={editor.detail ? editor.setRename : undefined}
          view={resolved}
          onViewChange={onViewChange}
          onBack={() => guard(onBack)}
          onOpenChat={onOpenChat}
          onPromote={editor.onPromote}
          onEnableAll={editor.onEnableAll}
          onDelete={scoped.disableHere ?? editor.flow.openConfirmDelete}
          deleteLabel={
            scoped.disableHere
              ? t("skills:global.manage.disableForAgent")
              : undefined
          }
          deleteDisabled={scoped.pending}
        />
      }
    >
      {scoped.notice !== null && (
        <SkillOverrideNotice
          kind={scoped.notice}
          onUseWorkspaceVersion={scoped.useWorkspaceVersion}
          disabled={scoped.pending}
        />
      )}
      <SkillBodyEditor
        view={resolved}
        onViewChange={onViewChange}
        editor={editor}
      />
      {scopedAgent === null && (
        <SkillEditorAgentsCard agents={agents} editor={editor} />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          disabled={!editor.dirty}
          onClick={editor.discard}
        >
          {t("skills:editor.discard")}
        </Button>
        <AsyncButton
          type="button"
          className="rounded-full"
          disabled={!editor.savable}
          onClick={editor.save}
        >
          {t("skills:detail.saveChanges")}
        </AsyncButton>
      </div>
      <SkillEditorConfirms
        row={row}
        pendingRemoveCount={editor.flow.pendingRemoveCount}
        pendingRemoveNames={editor.flow.pendingRemoveNames}
        onCancelRemove={editor.flow.cancelRemove}
        onConfirmRemove={editor.flow.confirmRemove}
        confirmDelete={editor.flow.confirmDelete}
        deleteSharedCopy={editor.isShared}
        onCancelDelete={editor.flow.cancelConfirmDelete}
        onConfirmDelete={editor.flow.confirmDeleteNow}
        scopedAct={scoped.confirming}
        onCancelScopedAct={scoped.onCancelConfirm}
        onConfirmScopedAct={scoped.onConfirm}
      />
      <ConfirmDialog
        open={pendingLeave !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLeave(null);
        }}
        title={t("skills:editor.discardConfirmTitle")}
        description={t("skills:editor.discardConfirmBody")}
        confirmLabel={t("skills:editor.discardConfirmConfirm")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={() => {
          const run = pendingLeave?.run;
          setPendingLeave(null);
          run?.();
        }}
      />
    </SkillsSurfaceFrame>
  );
}

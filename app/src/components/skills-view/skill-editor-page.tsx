import {
  AsyncButton,
  Button,
  CATALOG_PLANE_MAX_W,
  ConfirmDialog,
  cn,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { PageContainer } from "../shell/page-shell";
import { ManageSkillConfirms } from "./manage-skill-confirms";
import type {
  ManagedSkillRow,
  ManageSkillDialogProps,
  SharedDialogActions,
} from "./manage-skill-dialog-props";
import { SkillBodyEditor } from "./skill-body-editor";
import { SkillEditorAgentsCard } from "./skill-editor-agents-card";
import { SkillEditorHeader } from "./skill-editor-header";
import {
  resolveSkillEditorView,
  type SkillEditorView,
} from "./skill-editor-model";
import { useSkillEditor } from "./use-skill-editor";

export interface SkillEditorPageProps {
  row: ManagedSkillRow;
  agents: Agent[];
  onApply: ManageSkillDialogProps["onApply"];
  onDeleteEverywhere: ManageSkillDialogProps["onDeleteEverywhere"];
  shared?: SharedDialogActions;
  /** The view the host pinned (the chat's "Edit manually"), or null for the
   *  skill's own default. */
  view: SkillEditorView | null;
  onViewChange: (view: SkillEditorView) => void;
  /** Back to the library list. */
  onBack: () => void;
  /** Reopen the skill's chat; omitted while it is already on the glass. */
  onOpenChat?: () => void;
}

/**
 * One skill, full page: the workflow (or its markdown) on the left of the
 * shell's detail panel, which holds the skill's own chat. It takes the whole
 * Integrations screen in place of the library list, header strip included: the
 * editor's own back arrow is the way back to the list, under the tab cluster.
 *
 * Content, the pending rename and the agent assignment commit in ONE save,
 * through the same flow the per-agent manage dialog uses.
 */
export function SkillEditorPage({
  row,
  agents,
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
    onApply,
    onDeleteEverywhere,
    shared,
    onBack,
  });
  const [confirmLeave, setConfirmLeave] = useState(false);
  const hasWorkflow = (editor.detail?.workflow?.steps.length ?? 0) > 0;
  const resolved = resolveSkillEditorView(view, hasWorkflow);

  const leave = () => {
    if (editor.dirty) setConfirmLeave(true);
    else onBack();
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="skill-editor">
      <SkillEditorHeader
        row={row}
        rename={editor.rename}
        onRename={editor.detail ? editor.setRename : undefined}
        view={resolved}
        onViewChange={onViewChange}
        onBack={leave}
        onOpenChat={onOpenChat}
        onPromote={editor.onPromote}
        onEnableAll={editor.onEnableAll}
        onDelete={editor.flow.openConfirmDelete}
      />
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <PageContainer width="wide" className="pt-2 pb-10">
          <div
            className={cn(
              "mx-auto flex w-full flex-col gap-4",
              CATALOG_PLANE_MAX_W,
            )}
          >
            <SkillBodyEditor
              variant="page"
              view={resolved}
              onViewChange={onViewChange}
              editor={editor}
            />
            <SkillEditorAgentsCard agents={agents} editor={editor} />
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
          </div>
        </PageContainer>
      </div>
      <ManageSkillConfirms
        row={row}
        pendingRemoveCount={editor.flow.pendingRemoveCount}
        pendingRemoveNames={editor.flow.pendingRemoveNames}
        onCancelRemove={editor.flow.cancelRemove}
        onConfirmRemove={editor.flow.confirmRemove}
        confirmDelete={editor.flow.confirmDelete}
        deleteSharedCopy={editor.isShared}
        onCancelDelete={editor.flow.cancelConfirmDelete}
        onConfirmDelete={editor.flow.confirmDeleteNow}
      />
      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t("skills:editor.discardConfirmTitle")}
        description={t("skills:editor.discardConfirmBody")}
        confirmLabel={t("skills:editor.discardConfirmConfirm")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={() => {
          setConfirmLeave(false);
          onBack();
        }}
      />
    </div>
  );
}

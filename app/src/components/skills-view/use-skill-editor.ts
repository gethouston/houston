import { useRef, useState } from "react";
import { withSkillTitle } from "../../lib/skill-title";
import type { Agent } from "../../lib/types";
import {
  reconcileSkillDraft,
  type SkillDraft,
  seedSkillDraft,
  skillDraftDirty,
} from "./skill-editor-model";
import type {
  ManagedSkillRow,
  SharedDialogActions,
  SkillEditorActions,
} from "./skill-editor-props";
import { useSkillDetailSurface } from "./use-skill-detail-surface";
import { useSkillSave } from "./use-skill-save";

export interface SkillEditorArgs extends SkillEditorActions {
  row: ManagedSkillRow;
  agent: Agent;
  shared?: SharedDialogActions;
  onBack: () => void;
}

export function useSkillEditor(args: SkillEditorArgs) {
  const { row, agent, onApply, onDeleteEverywhere, shared, onBack } = args;
  const { isShared, detail, error, refetch, rename, setRename } =
    useSkillDetailSurface({ row, shared, onLeave: onBack });

  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const seeded =
    detail === undefined
      ? draft
      : draft === null
        ? seedSkillDraft(detail.content)
        : reconcileSkillDraft(draft, detail.content);
  if (seeded !== draft) setDraft(seeded);

  const savedContent = useRef<string | null>(null);
  const flow = useSkillSave({
    row,
    agent,
    isShared,
    shared,
    onApply,
    onDeleteEverywhere,
    onSaved: () => {
      setRename(null);
      if (savedContent.current !== null)
        setDraft(seedSkillDraft(savedContent.current));
      savedContent.current = null;
    },
    onDeleted: onBack,
  });

  const contentDirty = seeded !== null && skillDraftDirty(seeded);
  const dirty = contentDirty || rename !== null;

  const save = async () => {
    if (seeded === null) return;
    const content =
      rename !== null ? withSkillTitle(seeded.text, rename) : seeded.text;
    savedContent.current = content;
    await flow.save({ content, contentDirty: dirty });
  };

  return {
    detail,
    error,
    isShared,
    draft: seeded,
    setText: (text: string) =>
      setDraft((current) => (current ? { ...current, text } : current)),
    reload: () => setDraft(detail ? seedSkillDraft(detail.content) : null),
    retryLoad: () => {
      void refetch();
    },
    discard: () => {
      setDraft(detail ? seedSkillDraft(detail.content) : null);
      setRename(null);
    },
    rename,
    setRename,
    dirty,
    savable: dirty,
    save,
    flow,
  };
}

export type SkillEditorState = ReturnType<typeof useSkillEditor>;

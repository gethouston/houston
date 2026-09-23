import { useRef, useState } from "react";
import { withSkillTitle } from "../../lib/skill-title";
import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
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
import { offersPromoteToWorkspace } from "./skills-scope";
import { useSkillDetailSurface } from "./use-skill-detail-surface";
import { useSkillSave } from "./use-skill-save";

export interface SkillEditorArgs extends SkillEditorActions {
  row: ManagedSkillRow;
  agents: Agent[];
  /** The one AI Employee this surface is scoped to, or null for the library. */
  scopedAgent: Agent | null;
  shared?: SharedDialogActions;
  /** Leave the editor and return to the library list. */
  onBack: () => void;
}

/**
 * The full-page skill editor's state: the skill's canonical SKILL.md, the
 * draft over it, the agent selection, and the one save that commits all three.
 *
 * The detail query is the SAME key the list rides, so the chat on the right
 * writing SKILL.md invalidates it (`SkillsChanged` / `SharedSkillsChanged`)
 * and the left pane follows live — keeping a dirty draft and offering a
 * reload instead of discarding typed work.
 */
export function useSkillEditor(args: SkillEditorArgs) {
  const {
    row,
    agents,
    scopedAgent,
    onApply,
    onDeleteEverywhere,
    shared,
    onBack,
  } = args;
  const { isShared, assignment, detail, error, refetch, rename, setRename } =
    useSkillDetailSurface({ row, shared, onLeave: onBack });

  // Seeded the moment the content lands, then reconciled against every later
  // server copy (see `reconcileSkillDraft`). Reconciling during render rather
  // than in an effect keeps the first paint of a fresh copy correct.
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const seeded =
    detail === undefined
      ? draft
      : draft === null
        ? seedSkillDraft(detail.content)
        : reconcileSkillDraft(draft, detail.content);
  if (seeded !== draft) setDraft(seeded);

  // What the in-flight save is writing. The copy-based unassign path detours
  // through a confirm before it applies, so the new baseline can only be
  // adopted when the save actually LANDS — adopting it optimistically would
  // disable Save after a failed write, with the user's text still on screen.
  const savedContent = useRef<string | null>(null);
  const flow = useSkillSave({
    row,
    agents,
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

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const assigned = flow.assignedIds;
  const selection = selected ?? assigned;

  const contentDirty = seeded !== null && skillDraftDirty(seeded);
  const assignmentDirty =
    assignment === "editable" &&
    (selection.size !== assigned.size ||
      [...selection].some((id) => !assigned.has(id)));
  const dirty = contentDirty || assignmentDirty || rename !== null;
  // Copy-based rows: unassigning everyone IS deletion, and that path goes
  // through the explicit Delete action — an empty selection can never ride an
  // innocuous-looking Save. Store-backed rows keep the skill either way.
  const savable = dirty && (isShared || selection.size > 0);

  const save = async () => {
    if (seeded === null) return;
    const content =
      rename !== null ? withSkillTitle(seeded.text, rename) : seeded.text;
    savedContent.current = content;
    await flow.save({
      content,
      contentDirty: contentDirty || rename !== null,
      afterIds: new Set(selection),
    });
  };

  const asShared = row as SharedSkillRow;
  const promotable = offersPromoteToWorkspace({
    scopedAgentId: scopedAgent?.id ?? null,
    origin: row.origin,
    sharedStore: shared !== undefined,
  });
  return {
    detail,
    error,
    isShared,
    assignment,
    /** Null until the skill's SKILL.md has landed. */
    draft: seeded,
    setText: (text: string) =>
      setDraft((current) => (current ? { ...current, text } : current)),
    /** Drop the draft for the server copy the chat just wrote. */
    reload: () => setDraft(detail ? seedSkillDraft(detail.content) : null),
    /** Ask for the skill again after a load that did not answer. */
    retryLoad: () => {
      void refetch();
    },
    /** Throw the whole edit away: text, rename and assignment together. */
    discard: () => {
      setDraft(detail ? seedSkillDraft(detail.content) : null);
      setSelected(null);
      setRename(null);
    },
    rename,
    setRename,
    selection,
    toggleAgent: (agent: Agent) =>
      setSelected(() => {
        const next = new Set(selection);
        if (next.has(agent.id)) next.delete(agent.id);
        else next.add(agent.id);
        return next;
      }),
    assigned,
    dirty,
    savable,
    save,
    flow,
    /** Store-backed extras, resolved once so the views stay presentational. */
    onEnableAll:
      isShared && shared && assigned.size < agents.length
        ? async () => {
            await shared.onEnableAll(asShared);
            setSelected(new Set(agents.map((a) => a.id)));
          }
        : undefined,
    onPromote:
      promotable && shared
        ? async () => {
            await shared.onPromote(asShared);
            onBack();
          }
        : undefined,
    overrides:
      isShared && shared && (row.overriddenBy ?? []).length > 0
        ? {
            agents: agents.filter((a) =>
              (row.overriddenBy ?? []).some((o) => o.id === a.id),
            ),
            onRevert: (agent: Agent) => shared.onRevert(asShared, agent),
          }
        : undefined,
  };
}

export type SkillEditorState = ReturnType<typeof useSkillEditor>;

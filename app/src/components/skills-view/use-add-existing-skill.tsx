import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import { AddExistingSkillDialog } from "./add-existing-skill-dialog";
import { addableSkills, offersAddExisting } from "./addable-skills";
import type {
  ManagedSkillRow,
  SharedDialogActions,
} from "./skill-editor-props";

/**
 * "Add an existing skill" on an AI Employee's own Skills section: the
 * workspace store skills it does not load yet, and the manifest write that
 * gives it one.
 *
 * The write is the SAME one the skill editor commits for its assignment
 * (`SharedDialogActions.onApply`), so an add here and an enable there are one
 * behavior with one invalidation; only the notice names the intent. The library scope opens
 * nothing: it stands on no employee to add to.
 */
export function useAddExistingSkill(opts: {
  /** The employee this surface is scoped to, or null for the library. */
  agent: Agent | null;
  /** Every row this surface's scope reads, BEFORE it is narrowed to the
   *  employee — a skill it does not have yet is exactly what is offered. */
  rows: ManagedSkillRow[];
  /** Store handlers, present exactly when the deployment shares. */
  shared: SharedDialogActions | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}): {
  node: ReactNode;
  /** Open the dialog; undefined where there is no employee to add to, or no
   *  workspace store the add could write against. */
  start: (() => void) | undefined;
} {
  const { agent, rows, shared, loading, failed, onRetry } = opts;
  const { t } = useTranslation("skills");
  const [open, setOpen] = useState(false);

  const skills = useMemo(
    () => addableSkills(rows, agent?.id ?? null),
    [rows, agent],
  );

  const onAdd = useCallback(
    async (row: ManagedSkillRow) => {
      // Unreachable: without an employee or a store there is nothing to
      // offer, so the list is empty and no row exists to press.
      if (agent === null || shared === undefined) return;
      await shared.onApply(
        // Narrowed by `addableSkills`, which keeps store rows only.
        row as SharedSkillRow,
        // Nothing is written to the store copy: `contentDirty: false` is what
        // makes this an assignment alone, and the employee starts loading the
        // workspace version as it stands.
        { content: "", contentDirty: false },
        { enable: [agent.folderPath], disable: [] },
        t("global.addExisting.added", {
          name: skillDisplayTitle(row.summary),
        }),
      );
    },
    [agent, shared, t],
  );

  return {
    node: (
      <AddExistingSkillDialog
        open={open}
        onOpenChange={setOpen}
        skills={skills}
        loading={loading}
        failed={failed}
        onRetry={onRetry}
        onAdd={onAdd}
      />
    ),
    start: offersAddExisting({
      agentId: agent?.id ?? null,
      sharedStore: shared !== undefined,
    })
      ? () => setOpen(true)
      : undefined,
  };
}

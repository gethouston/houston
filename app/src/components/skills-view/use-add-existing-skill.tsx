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

export function useAddExistingSkill(opts: {
  agent: Agent;
  rows: ManagedSkillRow[];
  shared: SharedDialogActions | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}): {
  node: ReactNode;
  start: (() => void) | undefined;
} {
  const { agent, rows, shared, loading, failed, onRetry } = opts;
  const { t } = useTranslation("skills");
  const [open, setOpen] = useState(false);

  const skills = useMemo(() => addableSkills(rows, agent.id), [rows, agent]);

  const onAdd = useCallback(
    async (row: ManagedSkillRow) => {
      if (shared === undefined) return;
      await shared.onAddToAgent(
        row as SharedSkillRow,
        agent,
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
    start: offersAddExisting({ sharedStore: shared !== undefined })
      ? () => setOpen(true)
      : undefined,
  };
}

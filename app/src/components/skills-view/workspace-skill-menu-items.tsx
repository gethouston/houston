import { DropdownMenuItem } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { logAndReportError } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type { SkillEditorActions } from "./skill-editor-props";
import { useSkillsModels } from "./use-skills-models";
import {
  offersDeleteForEveryone,
  offersEnableForAll,
  offersShareToWorkspace,
  withCanonicalHolder,
  workspaceActsState,
} from "./workspace-skill-acts";

export interface WorkspaceDeleteRequest {
  holders: string[];
  run: () => Promise<void>;
}

interface WorkspaceSkillMenuProps {
  slug: string;
  agent: Agent;
  workspaceAgents: Agent[];
  onDeleteEverywhere: SkillEditorActions["onDeleteEverywhere"];
  onBack: () => void;
  guard: (run: () => void) => void;
  onRequestDelete: (request: WorkspaceDeleteRequest) => void;
}

export function WorkspaceSkillMenuItems(props: WorkspaceSkillMenuProps) {
  const { manageWorkspaceSkills } = useSurfaceGates();
  return manageWorkspaceSkills ? <WorkspaceActs {...props} /> : null;
}

function WorkspaceActs(props: WorkspaceSkillMenuProps) {
  const { t } = useTranslation("skills");
  const models = useSkillsModels(props.workspaceAgents);
  const row = models.rows.find((r) => r.slug === props.slug);
  const state = workspaceActsState({
    loading: models.loading,
    failed: models.failed,
    complete: models.complete,
    found: row !== undefined,
  });
  if (state === "checking" || state === "failed") {
    return (
      <DropdownMenuItem disabled>
        {state === "checking"
          ? t("global.manage.checkingEveryone")
          : t("global.manage.checkEveryoneFailed")}
      </DropdownMenuItem>
    );
  }
  if (!row) return null;

  const shared = models.shared;
  const sharedStore = shared !== undefined;
  const asShared = row as SharedSkillRow;
  const report = (event: string) => (err: unknown) =>
    logAndReportError(event, err);

  return (
    <>
      {offersShareToWorkspace(row, sharedStore) && shared && (
        <DropdownMenuItem
          onSelect={() =>
            props.guard(() => {
              void shared
                .onPromote(withCanonicalHolder(asShared, props.agent.id))
                .then(props.onBack)
                .catch(report("skill_share_to_workspace"));
            })
          }
        >
          {t("global.manage.shareToWorkspace")}
        </DropdownMenuItem>
      )}
      {offersEnableForAll(row, props.workspaceAgents.length, sharedStore) &&
        shared && (
          <DropdownMenuItem
            onSelect={() => {
              void shared
                .onEnableAll(asShared)
                .catch(report("skill_enable_for_all"));
            }}
          >
            {t("global.manage.enableAll")}
          </DropdownMenuItem>
        )}
      {offersDeleteForEveryone(row, sharedStore) && (
        <DropdownMenuItem
          variant="destructive"
          onSelect={() =>
            props.onRequestDelete(
              shared && row.origin === "shared"
                ? { holders: [], run: () => shared.onDelete(asShared) }
                : {
                    holders: row.agents.map((a) => a.name),
                    run: () => props.onDeleteEverywhere(row),
                  },
            )
          }
        >
          {t("global.manage.deleteForEveryone")}
        </DropdownMenuItem>
      )}
    </>
  );
}

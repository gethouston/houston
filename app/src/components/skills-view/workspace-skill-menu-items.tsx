import { DropdownMenuItem } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { logAndReportError } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import type { SharedSkillRow } from "../../lib/workspace-shared-skills";
import type { SkillEditorActions } from "./skill-editor-props";
import { useKeepSkill } from "./use-keep-skill";
import { useSkillsModels } from "./use-skills-models";
import {
  offersDeleteForEveryone,
  offersEnableForAll,
  offersKeepOnlyForAgent,
  offersShareToWorkspace,
  withCanonicalHolder,
  workspaceActsState,
} from "./workspace-skill-acts";

/** A delete for every employee, waiting on the editor's confirm. */
export interface WorkspaceDeleteRequest {
  /** Who holds it, for the confirm's copy; empty for a store skill. */
  holders: string[];
  run: () => Promise<void>;
}

interface WorkspaceSkillMenuProps {
  slug: string;
  /** The employee whose editor this is: sharing publishes THEIR copy. */
  agent: Agent;
  workspaceAgents: Agent[];
  onDeleteEverywhere: SkillEditorActions["onDeleteEverywhere"];
  /** The skill moved into the store, or left: back to the list. */
  onBack: () => void;
  /** Run an act that leaves the editor behind the dirty-draft confirm. */
  guard: (run: () => void) => void;
  onRequestDelete: (request: WorkspaceDeleteRequest) => void;
}

/**
 * The skill editor menu's acts that reach EVERY employee: Share to workspace,
 * Enable for all, Delete for all. They are the space owner's
 * (`manageWorkspaceSkills`), so anyone else reads nothing and sees none.
 */
export function WorkspaceSkillMenuItems(props: WorkspaceSkillMenuProps) {
  const { manageWorkspaceSkills } = useSurfaceGates();
  return manageWorkspaceSkills ? <WorkspaceActs {...props} /> : null;
}

/**
 * The acts need the skill's WORKSPACE row (every holder), which one
 * employee's section never reads, so this reads every employee's skills when
 * it mounts, and the menu mounts it only while open: opening an employee's
 * Skills section wakes no one else, the menu does. Nothing is offered until
 * every read has landed (`workspaceActsState`), or a partial row would act on
 * some holders and miss the rest.
 */
function WorkspaceActs(props: WorkspaceSkillMenuProps) {
  const { t } = useTranslation("skills");
  const keep = useKeepSkill();
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
      {offersKeepOnlyForAgent(row, props.agent.id, sharedStore) && shared && (
        <DropdownMenuItem
          onSelect={() =>
            props.guard(() => {
              void keep(
                shared.workspaceId,
                props.agent.folderPath,
                props.slug,
                props.onBack,
              );
            })
          }
        >
          {t("global.manage.keepOnly")}
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

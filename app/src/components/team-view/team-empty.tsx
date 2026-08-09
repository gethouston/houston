import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import type { TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";

/**
 * What a team with NO AGENTS shows instead of a section. Every section wears
 * the same two honest shapes, so the answer to "why is this blank" reads the
 * same wherever the user is:
 *
 * - the DEFAULT team (the workspace itself) is empty because the workspace has
 *   no agents yet, so it offers the create-an-agent door;
 * - a NAMED team is empty because nothing was moved into it, and a new agent
 *   would land in the default team — so it says how to fill THIS one instead of
 *   offering a button that would not.
 *
 * The copy is passed in already resolved: each section words its own promise
 * ("its missions", "its routines", "the files it keeps"), and the branch that
 * decides WHICH shape lives here, once.
 */
export function TeamEmpty({
  team,
  title,
  body,
  createLabel,
}: {
  team: TeamView;
  title: string;
  body: string;
  /** The create-an-agent label. Offered only on the default team. */
  createLabel: string;
}) {
  const { canCreate } = useCanCreateAgents();
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );

  return (
    <div className="flex h-full items-center justify-center">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{body}</EmptyDescription>
        </EmptyHeader>
        {team.isDefault && canCreate && (
          <Button
            className="mt-4 rounded-full"
            onClick={() => setCreateAgentDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {createLabel}
          </Button>
        )}
      </Empty>
    </div>
  );
}

/**
 * Each section's wording of {@link TeamEmpty}. Every section wears the same two
 * shapes and differs only in the promise it makes ("its missions" / "its
 * routines" / "the files it keeps"), so the shapes live above and the wordings
 * sit here side by side — a fourth section cannot invent a third shape by
 * accident. Written out rather than built from a key prefix: the locale keys are
 * type-checked against the resource augmentation, and a composed key is not.
 */

/** The Mission Control wording of {@link TeamEmpty}. */
export function TeamMissionEmpty({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  return (
    <TeamEmpty
      team={team}
      title={
        team.isDefault
          ? t("teamView.missionControl.empty.workspaceTitle")
          : t("teamView.missionControl.empty.teamTitle")
      }
      body={
        team.isDefault
          ? t("teamView.missionControl.empty.workspaceBody")
          : t("teamView.missionControl.empty.teamBody", { name: team.name })
      }
      createLabel={t("teamView.missionControl.empty.createAgent")}
    />
  );
}

/** The Routines wording of {@link TeamEmpty}. */
export function TeamRoutinesEmpty({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  return (
    <TeamEmpty
      team={team}
      title={
        team.isDefault
          ? t("teamView.routines.empty.workspaceTitle")
          : t("teamView.routines.empty.teamTitle")
      }
      body={
        team.isDefault
          ? t("teamView.routines.empty.workspaceBody")
          : t("teamView.routines.empty.teamBody", { name: team.name })
      }
      createLabel={t("teamView.routines.empty.createAgent")}
    />
  );
}

/** The Files wording of {@link TeamEmpty}. */
export function TeamFilesEmpty({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  return (
    <TeamEmpty
      team={team}
      title={
        team.isDefault
          ? t("teamView.files.empty.workspaceTitle")
          : t("teamView.files.empty.teamTitle")
      }
      body={
        team.isDefault
          ? t("teamView.files.empty.workspaceBody")
          : t("teamView.files.empty.teamBody", { name: team.name })
      }
      createLabel={t("teamView.files.empty.createAgent")}
    />
  );
}

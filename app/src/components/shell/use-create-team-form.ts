import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateAgentTeam,
  useOrg,
  useSetAgentTeamMemberOwner,
} from "../../hooks/queries";
import { logAndReportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  type CreateTeamSubmitOutcome,
  createTeamAction,
  createTeamSubmitOutcome,
  type FailedMemberAdd,
  memberAddFallout,
  teamMemberName,
} from "./create-team-submit";
import { teamNameTooLong } from "./team-identity-save";
import { useSidebarOverlayLayout } from "./use-sidebar-overlay-layout";

/**
 * The new team's own state, and the create that ends it.
 *
 * Two backends, one form. A C13 gateway OWNS the teams, so the team is a
 * server row and the people picked here become its first members; everywhere
 * else a team is the local backend's named sidebar group, which has no roster
 * to add anyone to. The branch is here and nowhere else — the step above only
 * knows whether to show the people picker.
 *
 * A refused CREATE keeps the sheet open with everything still typed: the
 * shared agent-teams write plumbing has already told the user what happened,
 * in their own words (`hooks/queries/agent-team-write.ts`), and a second
 * message here would say it twice. A refused member add is a different thing
 * entirely, because by then the team exists: each person is added on their
 * own, the flow ends where it was going, and the people the team could not
 * take are named once the user is standing in it.
 */
export function useCreateTeamForm({
  open,
  serverBacked,
  onDone,
}: {
  open: boolean;
  serverBacked: boolean;
  onDone: () => void;
}) {
  const { t, i18n } = useTranslation("teams");
  const create = useCreateAgentTeam();
  // This flow owns the member-add surface: every refusal is named together in
  // the ONE summary toast below, so the shared per-refusal toast is off here
  // and nowhere else (`hooks/queries/use-agent-teams.ts`).
  const addMember = useSetAgentTeamMemberOwner({ surfaceExpected: false });
  const { data: org } = useOrg(serverBacked);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const sidebar = useSidebarOverlayLayout(currentWorkspace?.id, serverBacked);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>();
  const [color, setColor] = useState<string>();
  const [memberIds, setMemberIds] = useState<string[]>([]);
  // The team this submission made, held for as long as the sheet is open: a
  // second press of Create finishes THAT team rather than making another one.
  const createdId = useRef<string | null>(null);

  useEffect(() => {
    if (open) return;
    setName("");
    setIcon(undefined);
    setColor(undefined);
    setMemberIds([]);
    createdId.current = null;
  }, [open]);

  const trimmed = name.trim();
  const tooLong = teamNameTooLong(name);

  /** Each picked person, added on their OWN: one refusal must not cost the
   *  user the team, nor the people after them in the list. */
  const addPickedMembers = async (
    teamId: string,
  ): Promise<FailedMemberAdd[]> => {
    const failed: FailedMemberAdd[] = [];
    for (const userId of memberIds) {
      try {
        await addMember.mutateAsync({ teamId, userId, owner: false });
      } catch (error) {
        const member = org?.members?.find((m) => m.userId === userId);
        failed.push({ name: member ? teamMemberName(member) : userId, error });
      }
    }
    return failed;
  };

  // Returned, never fired and forgotten: the bottom bar's AsyncButton holds
  // the press until it settles, and a rejected create travels on up to the
  // reporting paths instead of being swallowed here.
  const submit = async () => {
    if (!trimmed || tooLong) return;
    let outcome: CreateTeamSubmitOutcome;
    if (serverBacked) {
      const action = createTeamAction(createdId.current);
      const teamId =
        action.kind === "resume"
          ? action.teamId
          : (await create.mutateAsync({ name: trimmed, icon, color })).id;
      createdId.current = teamId;
      const fallout = memberAddFallout(await addPickedMembers(teamId));
      for (const err of fallout.report) {
        logAndReportError("create_team_add_member", err);
      }
      outcome = createTeamSubmitOutcome({
        createdId: teamId,
        failedMembers: fallout.names,
      });
    } else {
      const groupId = sidebar.createGroup(trimmed);
      if (groupId) sidebar.setGroupIdentity(groupId, { icon, color });
      outcome = createTeamSubmitOutcome({
        createdId: groupId,
        failedMembers: [],
      });
    }
    if (!outcome.land) return;
    onDone();
    // You made a place; you land in it (the Linear grammar). Landing on the
    // empty board is also what makes the next step obvious: add an agent.
    openTeamView(outcome.land.teamId, "mission-control");
    if (!outcome.toast) return;
    showExpectedStateToast(
      t("agentTeams.create.membersFailedTitle"),
      t("agentTeams.create.membersFailedBody", {
        names: new Intl.ListFormat(i18n.language, {
          type: "conjunction",
        }).format(outcome.toast.names),
        team: trimmed,
      }),
    );
  };

  return {
    name,
    icon,
    color,
    memberIds,
    /** The people this space can still add, or null when it has no roster. */
    candidates:
      serverBacked && org?.members
        ? org.members.filter((member) => !memberIds.includes(member.userId))
        : null,
    canSubmit: trimmed.length > 0 && !tooLong,
    setName,
    setIcon,
    setColor,
    addMemberId: (userId: string) =>
      setMemberIds((current) => [...current, userId]),
    submit,
  };
}

export type CreateTeamForm = ReturnType<typeof useCreateTeamForm>;

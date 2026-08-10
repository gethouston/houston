import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TeamView } from "../../lib/teams-model";
import { teamById } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { TEAM_NAME_MAX_RUNES } from "../team-view/team-members-model";
import { buildTeamIdentityChoices, teamPaletteColorId } from "./team-identity";
import { TeamIdentityNameRow } from "./team-identity-name-row";

/**
 * The rail's "Change icon & name" dialog: the ONE menu entry a team's "..."
 * offers for its identity, because name, mark and colour are one thing. It
 * renders the same `TeamIdentityNameRow` the create-team dialog does, so the
 * two surfaces cannot drift apart.
 *
 * Edits are STAGED and land on Save — never live while picking. The picker
 * keeps its popover open across clicks (a mark and a tint are a pair), and a
 * dialog writing every intermediate click to the gateway would broadcast each
 * half-decision to the whole team.
 */
export function EditTeamIdentityDialog({
  teams,
  renameGroup,
  setIdentity,
}: {
  teams: TeamView[];
  /** `ServerTeamActions.renameGroup` — branches on the backend once, there. */
  renameGroup: (teamId: string, newName: string) => void;
  /** `ServerTeamActions.setIdentity` — omitted field = leave alone. */
  setIdentity: (
    teamId: string,
    patch: { icon?: string | null; color?: string | null },
  ) => void;
}) {
  const { t } = useTranslation(["shell", "teams", "common"]);
  const teamId = useUIStore((s) => s.editTeamIdentityId);
  const setTeamId = useUIStore((s) => s.setEditTeamIdentityId);
  const team = teamById(teams, teamId);
  const choices = useMemo(() => buildTeamIdentityChoices(t), [t]);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>();
  const [color, setColor] = useState<string>();

  // Seed the form from the team each time the dialog OPENS for one — never
  // while it is open, so a teammate's concurrent edit cannot yank the fields
  // out from under the user mid-type.
  const openedTeamId = team?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed on the OPENED TEAM changing, deliberately not on every refetch of its fields
  useEffect(() => {
    if (!team) return;
    setName(team.name);
    setIcon(team.icon);
    setColor(teamPaletteColorId(team.color));
  }, [openedTeamId]);

  if (!team) return null;

  const trimmed = name.trim();
  const tooLong = Array.from(trimmed).length > TEAM_NAME_MAX_RUNES;
  const close = () => setTeamId(null);

  const save = () => {
    if (!trimmed || tooLong) return;
    if (trimmed !== team.name) renameGroup(team.id, trimmed);
    // Only what actually CHANGED goes on the wire; an omitted field is "leave
    // alone" on both backends, so an untouched half stays untouched.
    const patch: { icon?: string; color?: string } = {
      ...(icon !== undefined && icon !== team.icon ? { icon } : {}),
      ...(color !== undefined && color !== teamPaletteColorId(team.color)
        ? { color }
        : {}),
    };
    if (Object.keys(patch).length > 0) setIdentity(team.id, patch);
    close();
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("shell:sidebar.teams.identity")}</DialogTitle>
        </DialogHeader>
        <TeamIdentityNameRow
          icon={icon}
          colorId={color}
          name={name}
          choices={choices}
          onIconChange={setIcon}
          onColorChange={setColor}
          onNameChange={setName}
          nameInvalid={tooLong}
        />
        {tooLong && (
          <p className="text-sm text-danger-text">
            {t("teams:agentTeams.create.tooLong", { max: TEAM_NAME_MAX_RUNES })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={save} disabled={!trimmed || tooLong}>
            {t("common:actions.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

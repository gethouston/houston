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
import { buildTeamIdentityChoices, teamPaletteColorId } from "./team-identity";
import { TeamIdentityNameRow } from "./team-identity-name-row";
import {
  type TeamIdentityDraft,
  teamIdentitySaveWrites,
  teamNameTooLong,
} from "./team-identity-save";

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

  // The form's SEED is kept beside the draft: the save is a diff against what
  // the user was shown, never against the live team, whose fields a teammate
  // may have moved while the dialog was open.
  const [seeded, setSeeded] = useState<TeamIdentityDraft | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>();
  const [color, setColor] = useState<string>();

  // Seed the form from the team each time the dialog OPENS for one — never
  // while it is open, so a concurrent edit cannot yank the fields mid-type.
  const openedTeamId = team?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed on the OPENED TEAM changing, deliberately not on every refetch of its fields
  useEffect(() => {
    if (!team) return;
    const draft: TeamIdentityDraft = {
      name: team.name,
      icon: team.icon,
      colorId: teamPaletteColorId(team.color),
    };
    setSeeded(draft);
    setName(draft.name);
    setIcon(draft.icon);
    setColor(draft.colorId);
  }, [openedTeamId]);

  if (!team || !seeded) return null;

  const trimmed = name.trim();
  const tooLong = teamNameTooLong(name);
  const close = () => setTeamId(null);

  const save = () => {
    if (!trimmed || tooLong) return;
    // The diff rules (what renames, what patches, how a deselect becomes an
    // explicit null clear) are `teamIdentitySaveWrites`'s, unit-tested there.
    const writes = teamIdentitySaveWrites(seeded, {
      name,
      icon,
      colorId: color,
    });
    if (writes.rename) renameGroup(team.id, writes.rename);
    if (writes.patch) setIdentity(team.id, writes.patch);
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
        />
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

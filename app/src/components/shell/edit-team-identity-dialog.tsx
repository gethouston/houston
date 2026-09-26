import { FormDialog, Input } from "@houston-ai/core";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  teamDisplayColor,
  teamDisplayIcon,
  teamDisplayName,
} from "../../lib/team-display";
import type { TeamView } from "../../lib/teams-model";
import { buildTeamIdentityChoices, teamPaletteColorId } from "./team-identity";
import { TeamIdentityPopover } from "./team-identity-popover";
import {
  type TeamIdentityDraft,
  teamIdentitySaveWrites,
  teamNameTooLong,
} from "./team-identity-save";

/** Folder menu dialogs stage name or identity edits until Save. */
export function EditTeamIdentityDialog({
  team,
  mode,
  onClose,
  renameGroup,
  setIdentity,
}: {
  team: TeamView;
  mode: "rename" | "identity";
  onClose: () => void;
  /** Saves the folder name to the personal sidebar layout. */
  renameGroup: (teamId: string, newName: string) => void;
  /** An omitted identity field is left unchanged. */
  setIdentity: (
    teamId: string,
    patch: { icon?: string | null; color?: string | null },
  ) => void;
}) {
  const { t } = useTranslation(["shell", "teams", "common"]);
  const choices = useMemo(() => buildTeamIdentityChoices(t), [t]);

  // The save compares against the identity shown when the dialog opened.
  const [seeded, setSeeded] = useState<TeamIdentityDraft | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>();
  const [color, setColor] = useState<string>();

  // Seed the form from the team each time the dialog OPENS for one — never
  // while it is open, so a concurrent edit cannot yank the fields mid-type.
  const openedTeamId = team.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed on the OPENED TEAM changing, deliberately not on every refetch of its fields
  useEffect(() => {
    const draft: TeamIdentityDraft = {
      name: teamDisplayName(team),
      icon: teamDisplayIcon(team),
      colorId: teamPaletteColorId(teamDisplayColor(team)),
    };
    setSeeded(draft);
    setName(draft.name);
    setIcon(draft.icon);
    setColor(draft.colorId);
  }, [openedTeamId]);

  if (!seeded) return null;

  const trimmed = name.trim();
  const tooLong = teamNameTooLong(name);

  // The save closes the dialog by RESOLVING: the recipe owns the close, so a
  // name that is still empty or too long is refused by `disabled` alone.
  const save = () => {
    // The diff rules (what renames, what patches, how a deselect becomes an
    // explicit null clear) are `teamIdentitySaveWrites`'s, unit-tested there.
    const writes = teamIdentitySaveWrites(seeded, {
      name: mode === "rename" ? name : seeded.name,
      icon,
      colorId: color,
    });
    if (writes.rename) renameGroup(team.id, writes.rename);
    if (writes.patch) setIdentity(team.id, writes.patch);
    onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={t(
        mode === "rename"
          ? "shell:sidebar.teams.rename"
          : "shell:sidebar.teams.identity",
      )}
      primary={{
        label: t("common:actions.save"),
        onClick: save,
        disabled: mode === "rename" && (!trimmed || tooLong),
      }}
      labels={{ cancel: t("common:actions.cancel") }}
    >
      {mode === "rename" ? (
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={t("teams:agentTeams.form.nameLabel")}
        />
      ) : (
        <TeamIdentityPopover
          icon={icon}
          colorId={color}
          choices={choices}
          onIconChange={setIcon}
          onColorChange={setColor}
        />
      )}
    </FormDialog>
  );
}

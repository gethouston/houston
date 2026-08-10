import { Input } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { TeamIdentityChoices } from "./team-identity";
import { TeamIdentityPopover } from "./team-identity-popover";

/**
 * The "Icon & Name" form row: one label, then the identity button and the name
 * field as a single object. The button IS the icon-and-colour picker (a
 * popover of swatches + searchable glyph grid) and always previews the pair
 * the team will get.
 *
 * ONE component on purpose: the create-team dialog and the rail's
 * "Change icon & name" dialog both render a team's identity through this row,
 * so the two surfaces cannot drift apart.
 */
export function TeamIdentityNameRow({
  icon,
  colorId,
  name,
  choices,
  onIconChange,
  onColorChange,
  onNameChange,
  nameInvalid,
}: {
  icon: string | undefined;
  colorId: string | undefined;
  name: string;
  choices: TeamIdentityChoices;
  onIconChange: (iconName: string) => void;
  onColorChange: (id: string) => void;
  onNameChange: (name: string) => void;
  /** Marks the field for the caller's own validation copy below the row. */
  nameInvalid?: boolean;
}) {
  const { t } = useTranslation(["teams"]);
  return (
    <div className="flex items-center gap-4">
      <span className="shrink-0 text-sm font-medium text-ink">
        {t("teams:agentTeams.create.iconAndName")}
      </span>
      <div className="flex flex-1 items-center gap-2">
        <TeamIdentityPopover
          icon={icon}
          colorId={colorId}
          choices={choices}
          onIconChange={onIconChange}
          onColorChange={onColorChange}
        />
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t("teams:agentTeams.create.namePlaceholder")}
          aria-label={t("teams:agentTeams.create.nameLabel")}
          aria-invalid={nameInvalid || undefined}
        />
      </div>
    </div>
  );
}

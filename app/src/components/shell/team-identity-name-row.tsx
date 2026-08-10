import { Input } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { TEAM_NAME_MAX_RUNES } from "../team-view/team-members-model";
import type { TeamIdentityChoices } from "./team-identity";
import { TeamIdentityPopover } from "./team-identity-popover";
import { teamNameTooLong } from "./team-identity-save";

/**
 * The "Icon & Name" form row: one label, then the identity button and the name
 * field as a single object, with the shared too-long validation copy beneath.
 * The button IS the icon-and-colour picker (a popover of swatches + searchable
 * glyph grid) and always previews the pair the team will get.
 *
 * ONE component on purpose: the create-team dialog and the rail's
 * "Change icon & name" dialog both render a team's identity through this row —
 * layout, picker, validation rule and error copy alike — so the two surfaces
 * cannot drift apart. Callers read the same `teamNameTooLong` for their
 * submit gate and add nothing of their own.
 */
export function TeamIdentityNameRow({
  icon,
  colorId,
  name,
  choices,
  onIconChange,
  onColorChange,
  onNameChange,
}: {
  icon: string | undefined;
  colorId: string | undefined;
  name: string;
  choices: TeamIdentityChoices;
  /** `undefined` = cleared back to the neutral mark. */
  onIconChange: (iconName: string | undefined) => void;
  /** `undefined` = cleared back to the default ink. */
  onColorChange: (id: string | undefined) => void;
  onNameChange: (name: string) => void;
}) {
  const { t } = useTranslation(["teams"]);
  const tooLong = teamNameTooLong(name);
  return (
    <>
      <div className="flex items-center gap-4">
        <span className="shrink-0 text-sm font-medium text-ink">
          {t("teams:agentTeams.form.iconAndName")}
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
            placeholder={t("teams:agentTeams.form.namePlaceholder")}
            aria-label={t("teams:agentTeams.form.nameLabel")}
            aria-invalid={tooLong || undefined}
          />
        </div>
      </div>
      {tooLong && (
        <p className="text-sm text-danger-text">
          {t("teams:agentTeams.form.tooLong", { max: TEAM_NAME_MAX_RUNES })}
        </p>
      )}
    </>
  );
}

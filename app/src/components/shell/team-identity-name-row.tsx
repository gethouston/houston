import { SIDEBAR_GROUP_NAME_MAX_CODE_POINTS } from "@houston/protocol";
import { Input } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

import type { TeamIdentityChoices } from "./team-identity";
import { TeamIdentityPopover } from "./team-identity-popover";
import { teamNameTooLong } from "./team-identity-save";

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
  onIconChange: (iconName: string | undefined) => void;
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
          {t("teams:agentTeams.form.tooLong", {
            max: SIDEBAR_GROUP_NAME_MAX_CODE_POINTS,
          })}
        </p>
      )}
    </>
  );
}

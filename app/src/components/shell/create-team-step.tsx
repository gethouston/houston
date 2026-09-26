import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildTeamIdentityChoices } from "./team-identity";
import { TeamIdentityNameRow } from "./team-identity-name-row";
import type { CreateTeamForm } from "./use-create-team-form";

export function CreateTeamStep({ form }: { form: CreateTeamForm }) {
  const { t } = useTranslation("teams");
  const choices = useMemo(() => buildTeamIdentityChoices(t), [t]);
  return (
    <TeamIdentityNameRow
      icon={form.icon}
      colorId={form.color}
      name={form.name}
      choices={choices}
      onIconChange={form.setIcon}
      onColorChange={form.setColor}
      onNameChange={form.setName}
    />
  );
}

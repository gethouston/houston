import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentShareAddPeople } from "../agent/agent-share-add-people";
import { buildTeamIdentityChoices } from "./team-identity";
import { TeamIdentityNameRow } from "./team-identity-name-row";
import type { CreateTeamForm } from "./use-create-team-form";

/**
 * The new team, as ONE step of the create sheet: what it is called and what it
 * looks like in the rail, then who else belongs to it.
 *
 * The identity row is the SAME control the rail's "Change icon & name" uses
 * ({@link TeamIdentityNameRow}), so a team is named the one way whether it is
 * being made or edited. The people picker exists only where people do: on a
 * C13 gateway a team carries a roster, and everywhere else it is a local
 * grouping of the user's own agents with nobody to invite.
 *
 * It ends here. The action that creates the team is the sheet's bottom bar,
 * where every other step of every other path puts its primary. What the screen
 * is called is the sheet's TITLE, so the form starts at the first field
 * instead of under a second copy of its own name.
 */
export function CreateTeamStep({ form }: { form: CreateTeamForm }) {
  const { t } = useTranslation("teams");
  const choices = useMemo(() => buildTeamIdentityChoices(t), [t]);

  return (
    <div className="flex w-full flex-col gap-5">
      <TeamIdentityNameRow
        icon={form.icon}
        colorId={form.color}
        name={form.name}
        choices={choices}
        onIconChange={form.setIcon}
        onColorChange={form.setColor}
        onNameChange={form.setName}
      />
      {form.candidates && (
        <div>
          <p className="mb-2 text-sm text-ink-muted">
            {t("agentTeams.create.members")}
          </p>
          <AgentShareAddPeople
            candidates={form.candidates}
            onAdd={(member) => form.addMemberId(member.userId)}
          />
          {form.memberIds.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              {t("agentTeams.create.membersSelected", {
                count: form.memberIds.length,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

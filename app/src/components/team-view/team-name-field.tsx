import { Button, Input } from "@houston-ai/core";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateAgentTeam } from "../../hooks/queries/use-agent-teams";
import {
  clampToRunes,
  TEAM_NAME_MAX_RUNES,
  teamNameCommit,
} from "./team-members-model.ts";

/**
 * The team's name, editable in place (C13). Team Settings is the ONLY door onto
 * it: the rail's group menu renames a team you own, but the space's default
 * team deliberately carries no menu (it is the container every agent falls back
 * into), and its name is the one every member reads at the top of the rail.
 *
 * Mounted with the saved name as its seed and REMOUNTED by its `key` when that
 * name changes, so it re-syncs to server truth without an effect that could
 * overwrite what the user is mid-way through typing. Save is disabled until the
 * name would actually change something ({@link teamNameCommit}), so the button
 * never promises a write the gateway would refuse; the failure path belongs to
 * the mutation hook, so only the disabled state is decided here.
 *
 * The field itself stops at the gateway's {@link TEAM_NAME_MAX_RUNES} ceiling,
 * counted in runes. It CLAMPS rather than refuses, so a paste of something too
 * long lands as its first 60 characters instead of being swallowed: pasting is
 * never blocked. A `maxLength` attribute would be the wrong rule, counting
 * UTF-16 units where the gateway counts code points.
 */
export function TeamNameField({
  teamId,
  savedName,
}: {
  teamId: string;
  savedName: string;
}) {
  const { t } = useTranslation("teams");
  const update = useUpdateAgentTeam();
  const fieldId = useId();
  const [value, setValue] = useState(savedName);

  const next = teamNameCommit(value, savedName);
  const pending = update.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (next === null || pending) return;
    update.mutate({ teamId, patch: { name: next } });
  };

  return (
    <form onSubmit={handleSubmit} className="mb-8 flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={fieldId}
          className="mb-2 block text-sm font-medium text-ink"
        >
          {t("agentTeams.settings.nameLabel")}
        </label>
        <Input
          id={fieldId}
          value={value}
          disabled={pending}
          data-testid="team-name-input"
          onChange={(event) =>
            setValue(clampToRunes(event.target.value, TEAM_NAME_MAX_RUNES))
          }
        />
      </div>
      <Button type="submit" disabled={next === null || pending}>
        {pending
          ? t("agentTeams.settings.nameSaving")
          : t("agentTeams.settings.nameSave")}
      </Button>
    </form>
  );
}

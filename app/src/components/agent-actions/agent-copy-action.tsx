import { Button, FormDialog, Input } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import { stayOpen } from "../../lib/dialog-stay-open";
import { teamDisplayName } from "../../lib/team-display";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { TeamGlyph } from "../shell/team-glyph";
import { suggestCopyName } from "./copy-agent-model";

/**
 * "Copy agent": name the duplicate and pick the team it joins. The current
 * team is offered too — copying next to the original is legal, the name is
 * what must differ (agent names are unique per WORKSPACE, not per team), so
 * the field opens pre-filled with the first free "<name> copy" and validates
 * live against the loaded agent list.
 */
export function AgentCopyDialog({
  agent,
  open,
  onOpenChange,
  teams,
  currentTeamId,
  existingNames,
  onCopy,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: readonly TeamView[];
  currentTeamId: string | null;
  existingNames: readonly string[];
  /** Resolves `true` when the copy exists — the dialog closes on it. */
  onCopy: (name: string, team: TeamView | null) => Promise<boolean>;
}) {
  const { t } = useTranslation(["agents", "teams", "common"]);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<string | null>(currentTeamId);

  // Re-seed per opening: the free name and the home team both move under the
  // dialog while it is closed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed only per opening
  useEffect(() => {
    if (!open) return;
    setName(
      suggestCopyName(
        agent.name,
        existingNames,
        t("agents:copyAgent.copySuffix"),
        AGENT_NAME_MAX_LENGTH,
      ),
    );
    setTeamId(currentTeamId);
  }, [open]);

  const issue = agentNameIssue(name, [...existingNames]);
  const issueText =
    issue === "taken"
      ? t("agents:copyAgent.nameTaken", { name: name.trim() })
      : issue === "tooLong"
        ? t("agents:nameErrors.tooLong", { max: AGENT_NAME_MAX_LENGTH })
        : issue === "invalidChars"
          ? t("agents:nameErrors.invalidChars")
          : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("agents:copyAgent.title", { name: agent.name })}
      description={t("agents:copyAgent.body")}
      primary={{
        label: t("agents:copyAgent.confirm"),
        disabled: name.trim().length === 0 || issue !== null,
        onClick: async () => {
          const team = teams.find((entry) => entry.id === teamId) ?? null;
          // A refused copy (a name that was taken while the dialog was open)
          // keeps the form on screen with the typed name — the caller has
          // already said why.
          if (!(await onCopy(name, team))) return stayOpen();
        },
      }}
      labels={{ cancel: t("common:actions.cancel") }}
    >
      <div className="grid gap-1.5">
        <label
          htmlFor="agent-copy-name"
          className="text-sm font-medium text-ink"
        >
          {t("agents:copyAgent.nameLabel")}
        </label>
        <Input
          id="agent-copy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={AGENT_NAME_MAX_LENGTH}
        />
        {issueText && <p className="text-xs text-danger">{issueText}</p>}
      </div>
      {teams.length > 1 && (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium text-ink">
            {t("agents:copyAgent.teamLabel")}
          </span>
          <div className="grid gap-2">
            {teams.map((team) => (
              <Button
                key={team.id}
                variant="outline"
                className="justify-start gap-2"
                aria-pressed={team.id === teamId}
                onClick={() => setTeamId(team.id)}
              >
                <TeamGlyph team={team} className="size-4 shrink-0" />
                <span className="truncate">{teamDisplayName(team)}</span>
                {team.id === teamId && (
                  <Check className="ml-auto size-4 shrink-0" />
                )}
              </Button>
            ))}
          </div>
        </div>
      )}
    </FormDialog>
  );
}

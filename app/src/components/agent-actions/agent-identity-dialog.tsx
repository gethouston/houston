import {
  AGENT_COLORS,
  agentColorId,
  colorValue,
  FormDialog,
  Input,
} from "@houston-ai/core";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_NAME_MAX_LENGTH, agentNameIssue } from "../../lib/agent-name";
import type { Agent } from "../../lib/types";
import { useEmployeeNameIssueCopy } from "../employee-card/use-employee-name";
import { AGENT_COLOR_LABEL_KEYS } from "../shell/agent-sidebar-color-menu";
import { ColorSwatch } from "../shell/team-identity-swatch";
import type { AgentIdentityPatch } from "./use-agent-identity-save";

export function AgentIdentityDialog({
  agent,
  otherNames,
  open,
  onOpenChange,
  onSave,
}: {
  agent: Agent;
  otherNames: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: AgentIdentityPatch) => void;
}) {
  const { t } = useTranslation(["teams", "shell", "common"]);
  const issueCopy = useEmployeeNameIssueCopy();
  const errorId = useId();
  const [name, setName] = useState(agent.name);
  const [colorId, setColorId] = useState(() => agentColorId(agent.color));
  const issueText =
    name.trim() === agent.name
      ? null
      : issueCopy(agentNameIssue(name, [...otherNames], agent.name), name);

  const save = () => {
    const nextName = name.trim();
    const patch = {
      ...(nextName && nextName !== agent.name ? { name: nextName } : {}),
      ...(colorId !== agentColorId(agent.color) ? { colorId } : {}),
    };
    if (patch.name !== undefined || patch.colorId !== undefined) onSave(patch);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(agent.name);
          setColorId(agentColorId(agent.color));
        }
        onOpenChange(next);
      }}
      title={t("teams:agentSettings.manage.identityTitle", {
        name: agent.name,
      })}
      primary={{
        label: t("common:actions.save"),
        onClick: save,
        disabled: !name.trim() || issueText !== null,
      }}
      labels={{ cancel: t("common:actions.cancel") }}
    >
      <div className="grid gap-1.5">
        <Input
          autoFocus
          value={name}
          maxLength={AGENT_NAME_MAX_LENGTH}
          aria-label={t("teams:agentSettings.manage.identity")}
          aria-invalid={issueText !== null}
          aria-describedby={issueText ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {issueText && (
          <p id={errorId} role="alert" className="text-xs text-danger">
            {issueText}
          </p>
        )}
      </div>
      <fieldset
        aria-label={t("shell:sidebar.changeColor")}
        className="flex flex-wrap gap-2"
      >
        {AGENT_COLORS.map((entry) => (
          <ColorSwatch
            key={entry.id}
            label={t(AGENT_COLOR_LABEL_KEYS[entry.id])}
            value={colorValue(entry)}
            selected={entry.id === colorId}
            onClick={() => setColorId(entry.id)}
          />
        ))}
      </fieldset>
    </FormDialog>
  );
}

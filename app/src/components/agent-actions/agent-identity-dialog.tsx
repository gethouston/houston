import {
  AGENT_COLORS,
  agentColorId,
  colorValue,
  FormDialog,
  Input,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AGENT_NAME_MAX_LENGTH } from "../../lib/agent-name";
import type { Agent } from "../../lib/types";
import { AGENT_COLOR_LABEL_KEYS } from "../shell/agent-sidebar-color-menu";
import { ColorSwatch } from "../shell/team-identity-swatch";
import type { AgentIdentityPatch } from "./use-agent-identity-save";

export function AgentIdentityDialog({
  agent,
  open,
  onOpenChange,
  onSave,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: AgentIdentityPatch) => void;
}) {
  const { t } = useTranslation(["teams", "shell", "common"]);
  const [name, setName] = useState(agent.name);
  const [colorId, setColorId] = useState(() => agentColorId(agent.color));

  // Saves what MOVED, so an untouched field is never written back over a
  // change someone else made meanwhile. The recipe closes on the resolve.
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
        disabled: !name.trim(),
      }}
      labels={{ cancel: t("common:actions.cancel") }}
    >
      <Input
        autoFocus
        value={name}
        maxLength={AGENT_NAME_MAX_LENGTH}
        aria-label={t("teams:agentSettings.manage.identity")}
        onChange={(event) => setName(event.target.value)}
      />
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

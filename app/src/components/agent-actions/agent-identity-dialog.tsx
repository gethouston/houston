import {
  AGENT_COLORS,
  agentColorId,
  Button,
  colorValue,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@houston-ai/core";
import { type FormEvent, useState } from "react";
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    const patch = {
      ...(nextName && nextName !== agent.name ? { name: nextName } : {}),
      ...(colorId !== agentColorId(agent.color) ? { colorId } : {}),
    };
    if (patch.name !== undefined || patch.colorId !== undefined) onSave(patch);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setName(agent.name);
          setColorId(agentColorId(agent.color));
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {t("teams:agentSettings.manage.identityTitle", {
                name: agent.name,
              })}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={AGENT_NAME_MAX_LENGTH}
            aria-label={t("teams:agentSettings.manage.identity")}
            className="mt-4"
            onChange={(event) => setName(event.target.value)}
          />
          <fieldset
            aria-label={t("shell:sidebar.changeColor")}
            className="my-4 flex flex-wrap gap-2"
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
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

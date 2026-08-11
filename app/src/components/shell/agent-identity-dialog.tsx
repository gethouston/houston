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
import { AGENT_COLOR_LABEL_KEYS } from "./agent-sidebar-color-menu";
import { ColorSwatch } from "./team-identity-swatch";

/**
 * The agent's "Change color & name" dialog — ONE identity surface, the way a
 * team's "..." offers one "Change icon & name" entry: a name and a colour are
 * one identity, not two menu items.
 *
 * Edits are STAGED and land on Save as two diffs: an unchanged half writes
 * nothing, so picking only a colour never fires a rename (and its 409 rules).
 * Like {@link AgentRenameDialog}, it validates nothing itself —
 * `useAgentActions` owns every rename rule and surfaces refusals as toasts.
 */
export function AgentIdentityDialog({
  agent,
  open,
  onOpenChange,
  onSave,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives only the halves that CHANGED. A rename moves the agent's
   *  folder-derived id, so the caller must sequence the two writes — never
   *  fire them in parallel off this one call. */
  onSave: (patch: { name?: string; colorId?: string }) => void;
}) {
  const { t } = useTranslation(["shell", "common"]);
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
        // Reopening starts from the agent's CURRENT identity, never from what
        // was abandoned last time.
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
              {t("sidebar.agentMenu.identityTitle", { name: agent.name })}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={AGENT_NAME_MAX_LENGTH}
            aria-label={t("sidebar.agentMenu.identity")}
            className="mt-4"
            onChange={(event) => setName(event.target.value)}
          />
          <fieldset
            aria-label={t("sidebar.changeColor")}
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

import {
  Button,
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

/**
 * Rename an agent, from its row in Manage agents.
 *
 * A DIALOG rather than the rail's inline edit: this page's rows are catalog
 * rows with a description line and a trailing menu, not a rename field
 * pretending to be a label. Turning one into an input mid-list moves the row's
 * own content and leaves the other rows looking editable when they are not.
 *
 * It validates NOTHING itself. `useAgentActions.rename` owns every rule (shape,
 * length, duplicate names, the 409 race) and surfaces refusals as expected-state
 * toasts in the user's words; a second copy here would be a second answer.
 * Empty and unchanged are the only cases the dialog handles, because those are
 * not refusals — they are the user deciding not to.
 */
export function AgentRenameDialog({
  agent,
  open,
  onOpenChange,
  onRename,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}) {
  const { t } = useTranslation("teams");
  const [draft, setDraft] = useState(agent.name);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next && next !== agent.name) onRename(next);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reopening starts from the agent's CURRENT name, never from what was
        // abandoned last time.
        if (next) setDraft(agent.name);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {t("teamView.agentMenu.renameTitle", { name: agent.name })}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draft}
            maxLength={AGENT_NAME_MAX_LENGTH}
            aria-label={t("teamView.agentMenu.renameLabel")}
            placeholder={t("teamView.agentMenu.renameLabel")}
            className="my-4"
            onChange={(event) => setDraft(event.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("teamView.move.cancel")}
            </Button>
            <Button type="submit" disabled={!draft.trim()}>
              {t("teamView.agentMenu.renameConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

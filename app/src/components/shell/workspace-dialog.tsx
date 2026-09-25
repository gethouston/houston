import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@houston-ai/core";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Workspace } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { BuildTeamCard } from "../onboarding/team/build-team-card";

/**
 * A new workspace: name it, then build its team.
 *
 * AI is connected once for the whole app, so naming is the only question
 * before the workspace exists. The moment it does, the app switches to it
 * behind the dialog, which is what lets the team card hire straight into it:
 * every hire is adopted by the roster of the CURRENT workspace, and the
 * sidebar fills in as the team is built. Closing the dialog at any point
 * leaves the person in the workspace they just made.
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["shell", "setup", "common"]);
  const closeLabel = t("common:actions.close");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setWorkspaceId(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {workspaceId === null ? (
        <DialogContent className="sm:max-w-md" closeLabel={closeLabel}>
          <DialogHeader>
            <DialogTitle>{t("shell:workspaceDialog.title")}</DialogTitle>
            <DialogDescription>{t("setup:name.description")}</DialogDescription>
          </DialogHeader>
          <WorkspaceNameForm onCreated={setWorkspaceId} />
        </DialogContent>
      ) : (
        // Top padding clears the close corner: every screen of the card opens
        // on its own headline, which would otherwise run under it.
        <DialogContent
          closeLabel={closeLabel}
          className="flex h-[min(44rem,88dvh)] flex-col gap-0 pt-12 sm:max-w-[min(var(--container-6xl),calc(100%-2rem))]"
        >
          {/* The card sets its own headline on every screen; the dialog's
              accessible name is the task the whole card is. */}
          <DialogTitle className="sr-only">
            {t("setup:team.choice.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("setup:team.choice.subtitle")}
          </DialogDescription>
          <BuildTeamCard
            workspaceId={workspaceId}
            mode="new_workspace"
            onDone={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** The one question before the workspace exists. A name already in use is
 *  said inline while typing, rather than refused after the round trip. */
function WorkspaceNameForm({
  onCreated,
}: {
  onCreated: (workspaceId: string) => void;
}) {
  const { t } = useTranslation(["shell", "setup"]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const createWorkspace = useWorkspaceStore((s) => s.create);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const inFlight = useRef(false);

  const trimmed = name.trim();
  const taken = workspaces.some(
    (ws) => ws.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const error = taken
    ? t("shell:workspaceDialog.nameTaken")
    : failed
      ? t("shell:workspaceDialog.createFailed")
      : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !trimmed || taken) return;
    inFlight.current = true;
    setCreating(true);
    setFailed(false);
    let ws: Workspace;
    try {
      ws = await createWorkspace(trimmed);
    } catch {
      // The engine call already logged, reported and toasted the failure
      // (`tauriWorkspaces.create` → `call`); what is left is to say so here
      // and keep the name, so trying again is one press.
      setFailed(true);
      inFlight.current = false;
      setCreating(false);
      return;
    }
    setCurrentWorkspace(ws);
    // Settles on its own either way (a failed list is reported upstream and
    // reads as empty), and an empty roster is right for a new workspace.
    await loadAgents(ws.id);
    onCreated(ws.id);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFailed(false);
          }}
          disabled={creating}
          placeholder={t("setup:name.placeholder")}
          aria-label={t("shell:workspaceDialog.nameLabel")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "workspace-name-error" : undefined}
          className="h-11 rounded-full px-4 md:h-10"
        />
        {error && (
          <p
            id="workspace-name-error"
            role="alert"
            className="px-4 text-xs text-danger"
          >
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col md:flex-row md:justify-end">
        <Button
          type="submit"
          disabled={!trimmed || taken || creating}
          className="h-11 rounded-full md:h-10 md:px-6"
        >
          {creating && <Spinner className="size-4" />}
          {t("shell:workspaceDialog.create")}
        </Button>
      </div>
    </form>
  );
}

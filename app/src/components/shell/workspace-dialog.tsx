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
        <DialogContent
          closeLabel={closeLabel}
          className="flex h-[min(44rem,88dvh)] flex-col gap-0 pt-12 sm:max-w-[min(var(--container-6xl),calc(100%-2rem))]"
        >
          <DialogTitle className="sr-only">
            {t("setup:team.choice.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("setup:team.choice.subtitle")}
          </DialogDescription>
          <BuildTeamCard
            workspaceId={workspaceId}
            onDone={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

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
      setFailed(true);
      inFlight.current = false;
      setCreating(false);
      return;
    }
    setCurrentWorkspace(ws);
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

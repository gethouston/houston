import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@houston-ai/core";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateTeam } from "../../hooks/queries/use-orgs";
import { orgSlugFromWorkspaceId } from "../../lib/space-id";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { ORGANIZATION_VIEW_ID } from "../organization/id.ts";
import { MAX_TEAM_NAME_LENGTH, validateTeamName } from "./create-team-model";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create a team space (C8 §Share-triggers-team, self-serve path). Only rendered
 * on a hosted deployment that advertises `capabilities.spaces`; the desktop /
 * self-host create action stays the local-workspace dialog.
 *
 * On success it switches straight into the new team through the workspaces
 * store's `setCurrent`, which IS the C8 E3 switch sequence (re-point
 * `x-houston-org` -> drop the query cache -> re-establish the event stream) —
 * never re-implemented here. The new team reaches the switcher via
 * `GET /v1/workspaces`, so the store is reloaded first (it is Zustand, not a
 * React Query cache the hook could invalidate) — the same explicit refresh the
 * local workspace-create flow does today.
 */
export function CreateTeamDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(["teams", "common"]);
  const createTeam = useCreateTeam();
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const addToast = useUIStore((s) => s.addToast);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const [name, setName] = useState("");

  // Start every open with a clean field; reset on close so a reopen after a
  // successful create (or a cancel) never shows the last value.
  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  const validation = validateTeamName(name);
  const submitting = createTeam.isPending;
  const showTooLong = !validation.ok && validation.reason === "too_long";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validation.ok || submitting) return;
    // `.mutate` (not `mutateAsync`): its promise is handled inside React Query,
    // so a rejection never leaks as an unhandled rejection. `useCreateTeam`
    // routes through the engine client's `call()` wrapper, which already
    // surfaces any failure as a red toast + Sentry report (see
    // hooks/queries/use-org.ts) — an `onError` here would double-toast, and we
    // simply leave the dialog open for a retry. `POST /v1/orgs` is not
    // idempotent, so the hook reconciles via `GET /v1/orgs` before retrying.
    createTeam.mutate(validation.name, {
      // `useCreateTeam`'s own onSuccess already awaits `loadWorkspaces()` before
      // this runs, so the store is fresh — reloading again here would double the
      // `GET /v1/workspaces` fetch. Just read the reloaded store.
      onSuccess: async (org) => {
        const ws = useWorkspaceStore
          .getState()
          .workspaces.find((w) => orgSlugFromWorkspaceId(w.id) === org.slug);
        if (ws) {
          setCurrentWorkspace(ws);
          await loadAgents(ws.id);
        }
        // Point the user at the next step: the Admin dashboard's People card,
        // now guaranteed visible because the active space is the fresh team.
        // The switch (setCurrent) already happened above, so the org view is
        // reachable the moment they click.
        addToast({
          title: t("teams:createTeam.successTitle", { name: org.name }),
          description: t("teams:createTeam.successBody"),
          variant: "success",
          action: {
            label: t("teams:createTeam.successAction"),
            onClick: () => setViewMode(ORGANIZATION_VIEW_ID),
          },
        });
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("teams:createTeam.title")}</DialogTitle>
            <DialogDescription>
              {t("teams:createTeam.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("teams:createTeam.namePlaceholder")}
              aria-label={t("teams:createTeam.nameLabel")}
              aria-invalid={showTooLong}
              disabled={submitting}
            />
            {showTooLong ? (
              <p className="mt-2 text-sm text-danger">
                {t("teams:createTeam.tooLong", { max: MAX_TEAM_NAME_LENGTH })}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!validation.ok || submitting}>
              {submitting
                ? t("teams:createTeam.creating")
                : t("teams:createTeam.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

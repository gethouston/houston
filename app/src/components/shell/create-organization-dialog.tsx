import { FormDialog, Input } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCreateTeam } from "../../hooks/queries/use-orgs";
import { stayOpen } from "../../lib/dialog-stay-open";
import { openHome } from "../../lib/home-nav";
import { openAdmin } from "../../lib/open-admin";
import { orgSlugFromWorkspaceId } from "../../lib/space-id";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { MAX_TEAM_NAME_LENGTH, validateTeamName } from "./create-team-model";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create an ORGANIZATION (`POST /v1/orgs`) — the shared space a personal
 * workspace turns into (C8 §Share-triggers-team, self-serve path). Only
 * rendered on a hosted deployment that advertises `capabilities.spaces`; the
 * desktop / self-host create action stays the local-workspace dialog.
 *
 * On success it switches straight into the new organization through the
 * workspaces store's `setCurrent`, which IS the C8 E3 switch sequence
 * (re-point `x-houston-org` -> drop the query cache -> re-establish the event
 * stream) — never re-implemented here. The new space reaches the switcher via
 * `GET /v1/workspaces`, so the store is reloaded first (it is Zustand, not a
 * React Query cache the hook could invalidate) — the same explicit refresh the
 * local workspace-create flow does today.
 */
export function CreateOrganizationDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation(["teams", "common"]);
  const createOrganization = useCreateTeam();
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const addToast = useUIStore((s) => s.addToast);
  const [name, setName] = useState("");

  // Start every open with a clean field; reset on close so a reopen after a
  // successful create (or a cancel) never shows the last value.
  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  const validation = validateTeamName(name);
  const showTooLong = !validation.ok && validation.reason === "too_long";

  // Resolving is what closes the dialog: the recipe owns the close, so an
  // empty or over-long name is refused by `disabled` alone.
  const submit = async () => {
    if (!validation.ok) return stayOpen();
    // `mutateAsync` so the recipe's pending state and its close are driven by
    // the real request. `useCreateTeam` routes through the engine client's
    // `call()` wrapper, which already surfaces any failure as a red toast +
    // one Sentry report — so the rejection is turned into `stayOpen()`: the
    // typed control signal that leaves the form up with the name intact and
    // files nothing a second time. `POST /v1/orgs` is not idempotent, so the
    // hook reconciles via `GET /v1/orgs` before a retry. (Not a swallow: the
    // handler re-rejects.)
    const org = await createOrganization
      .mutateAsync(validation.name)
      .catch(() => stayOpen());
    // `useCreateTeam`'s own onSuccess already awaited `loadWorkspaces()`, so
    // the store is fresh — reloading again here would double the
    // `GET /v1/workspaces` fetch. Just read the reloaded store.
    const ws = useWorkspaceStore
      .getState()
      .workspaces.find((w) => orgSlugFromWorkspaceId(w.id) === org.slug);
    if (ws) {
      setCurrentWorkspace(ws);
      await loadAgents(ws.id);
      // The active space just switched under the user. If they opened this
      // from Settings (or any non-home view, or an agent that belonged to the
      // old space and the reload above just dropped), the view would stay put
      // and the whole create reads as a silent failure. Land them on home —
      // the same place the shell sends a blocked view — so the switch is
      // visible. Home is the new space's first employee once its roster and
      // sidebar layout have settled; until then the Agents home stands and the
      // desktop boot rule opens that employee. The toast's Invite action then
      // opens Admin.
      openHome();
    }
    // Point the user at the Admin dashboard after the new space is active.
    // The switch (setCurrent) happens before the action can navigate.
    addToast({
      title: t("teams:createTeam.successTitle", { name: org.name }),
      description: t("teams:createTeam.successBody"),
      variant: "success",
      action: {
        label: t("teams:createTeam.successAction"),
        onClick: () => openAdmin(),
      },
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("teams:createTeam.title")}
      description={t("teams:createTeam.description")}
      primary={{
        label: t("teams:createTeam.submit"),
        pendingLabel: t("teams:createTeam.creating"),
        onClick: submit,
        disabled: !validation.ok,
      }}
      labels={{ cancel: t("common:actions.cancel") }}
    >
      <div>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("teams:createTeam.namePlaceholder")}
          aria-label={t("teams:createTeam.nameLabel")}
          aria-invalid={showTooLong}
          disabled={createOrganization.isPending}
        />
        {showTooLong ? (
          <p className="mt-2 text-sm text-danger">
            {t("teams:createTeam.tooLong", { max: MAX_TEAM_NAME_LENGTH })}
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}

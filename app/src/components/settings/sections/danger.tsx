import { Button, ConfirmDialog } from "@houston-ai/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { showExpectedStateToast } from "../../../lib/error-toast";
import { openHome } from "../../../lib/home-nav";
import { canDeleteWorkspace } from "../../../lib/org-roles";
import { isTeamWorkspace } from "../../../lib/space-id";
import { tauriOrg } from "../../../lib/tauri";
import {
  canDeleteOptimistically,
  classifyWorkspaceDeleteError,
  isExpectedWorkspaceDeleteError,
  type WorkspaceDeleteFailure,
} from "../../../lib/workspace-delete-model";
import { useAgentStore } from "../../../stores/agents";
import { useUIStore } from "../../../stores/ui";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { SettingsControlRow } from "../settings-row";

/**
 * Settings → Danger Zone: delete the ACTIVE team space for good (PRODUCT-1410).
 *
 * Shown only when all three hold — the deployment can delete a space at all
 * (`capabilities.workspaceDelete`, the gateway's feature-detect flag: absent on
 * desktop/self-host, where the one personal workspace is not deletable, and on
 * gateways that predate the route), the active space is a team (a personal
 * space goes with the account, never on its own), and the caller owns it
 * (PRODUCT-1247). Cosmetic gates all: the gateway is the sole enforcer, and
 * its two business rejections (`has_members`, `subscription_active`) come
 * back as plain informational toasts that say what to do first.
 *
 * Confirming pre-checks those two rejections against fresh active-org reads
 * (`GET /v1/org` roster + `GET /v1/org/billing`, PRODUCT-1426), and the
 * answer picks the UX shape, never the outcome:
 * a provably-deletable solo team switches the user to the default space with
 * the success toast immediately (the slow gateway delete finishes behind the
 * switch, with the store's rollback as the race net); anything the pre-check
 * can't prove waits for the gateway's verdict, so the user is never told
 * "deleted" about a space that still stands — rejections are fast, it's the
 * destruction that is slow.
 */
export function DangerSection() {
  const { t } = useTranslation("settings");
  const { capabilities } = useCapabilities();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const deleteWorkspace = useWorkspaceStore((s) => s.delete);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const addToast = useUIStore((s) => s.addToast);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!currentWorkspace) return null;
  if (!capabilities?.workspaceDelete) return null;
  if (!isTeamWorkspace(currentWorkspace.id)) return null;
  if (!canDeleteWorkspace(capabilities)) return null;

  // The active space switched under the user (the space they deleted owned
  // this Settings screen), so land them on home to make the switch visible.
  // The toast comes FIRST: the landing space's agent load can take seconds
  // (in the worst case an engine wake), and the user must not stare at a
  // silent screen wondering whether the delete took (PRODUCT-1426).
  const toastAndLandHome = async (name: string) => {
    addToast({
      title: t("dangerZone.deleted", { name }),
      variant: "success",
    });
    const landing = useWorkspaceStore.getState().current;
    if (landing) await loadAgents(landing.id);
    openHome();
  };

  const blockedToast = (
    failure: Exclude<WorkspaceDeleteFailure, "unknown">,
  ): void =>
    showExpectedStateToast(
      t(`dangerZone.blocked.${failure}.title`),
      t(`dangerZone.blocked.${failure}.body`),
    );

  // Returned to ConfirmDialog, whose async-confirm affordance keeps the dialog
  // open on a "Deleting…" spinner until this settles (or the optimistic switch
  // unmounts it, at which instant the success toast is already up).
  const handleDelete = async () => {
    const { id, name } = currentWorkspace;
    try {
      // Both reads address the ACTIVE space — still the doomed team here; the
      // optimistic switch only re-pins the gateway after they resolve.
      const provablyDeletable = await Promise.all([
        tauriOrg.get(),
        tauriOrg.getBilling(),
      ]).then(
        ([info, billing]) => canDeleteOptimistically(info.members, billing),
        // Not swallowed: the wire layer reported the read failure, and the
        // server-first path below gives the delete its own loud outcome.
        () => false,
      );
      if (provablyDeletable) {
        // The rejection handler attaches NOW (an unobserved rejection during
        // the navigation awaits would fire unhandledrejection); expected
        // rejections toast after the switch, unknown ones are already
        // reported by the wire layer, and the store restored the row.
        const settled = deleteWorkspace(
          id,
          { silence: isExpectedWorkspaceDeleteError },
          "optimistic",
        ).then(() => null, classifyWorkspaceDeleteError);
        await toastAndLandHome(name);
        const failure = await settled;
        if (failure !== null && failure !== "unknown") blockedToast(failure);
        return;
      }
      try {
        await deleteWorkspace(id, { silence: isExpectedWorkspaceDeleteError });
      } catch (err) {
        const failure = classifyWorkspaceDeleteError(err);
        if (failure !== "unknown") blockedToast(failure);
        return; // unknown: report already surfaced by the wire layer
      }
      await toastAndLandHome(name);
    } finally {
      setShowConfirm(false);
    }
  };

  return (
    <>
      <SettingsControlRow
        icon={Trash2}
        title={t("nav.danger")}
        description={t("dangerZone.description")}
        destructive
      >
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowConfirm(true)}
        >
          {t("dangerZone.confirmLabel")}
        </Button>
      </SettingsControlRow>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t("dangerZone.confirmTitle", { name: currentWorkspace.name })}
        description={t("dangerZone.confirmDescription")}
        confirmLabel={t("dangerZone.confirmLabel")}
        pendingLabel={t("dangerZone.deleting")}
        onConfirm={handleDelete}
      />
    </>
  );
}

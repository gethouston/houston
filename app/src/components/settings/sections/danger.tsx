import { Button, ConfirmDialog } from "@houston-ai/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { showExpectedStateToast } from "../../../lib/error-toast";
import { openHome } from "../../../lib/home-nav";
import { canDeleteWorkspace } from "../../../lib/org-roles";
import { isTeamWorkspace, orgSlugFromWorkspaceId } from "../../../lib/space-id";
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
 * Confirming pre-checks those two rejections against a fresh `GET /v1/orgs`
 * row (PRODUCT-1426), and the answer picks the UX shape, never the outcome:
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
  const [deleting, setDeleting] = useState(false);

  if (!currentWorkspace) return null;
  if (!capabilities?.workspaceDelete) return null;
  if (!isTeamWorkspace(currentWorkspace.id)) return null;
  if (!canDeleteWorkspace(capabilities)) return null;

  // The active space switched under the user (the space they deleted owned
  // this Settings screen), so land them on home to make the switch visible.
  const landHomeAndToast = async (name: string) => {
    const landing = useWorkspaceStore.getState().current;
    if (landing) await loadAgents(landing.id);
    openHome();
    addToast({
      title: t("dangerZone.deleted", { name }),
      variant: "success",
    });
  };

  const blockedToast = (
    failure: Exclude<WorkspaceDeleteFailure, "unknown">,
  ): void =>
    showExpectedStateToast(
      t(`dangerZone.blocked.${failure}.title`),
      t(`dangerZone.blocked.${failure}.body`),
    );

  const handleDelete = async () => {
    const { id, name } = currentWorkspace;
    setDeleting(true);
    try {
      const slug = orgSlugFromWorkspaceId(id);
      const provablyDeletable = await tauriOrg.listOrgs().then(
        (list) =>
          canDeleteOptimistically(list.orgs.find((o) => o.slug === slug)),
        // Not swallowed: the wire layer reported the list failure, and the
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
        await landHomeAndToast(name);
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
      await landHomeAndToast(name);
    } finally {
      setDeleting(false);
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
          disabled={deleting}
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
        onConfirm={handleDelete}
      />
    </>
  );
}

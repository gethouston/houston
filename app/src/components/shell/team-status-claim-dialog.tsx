import type { OrgSummary, OrgsList } from "@houston/engine-adapter";
import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useClaimFreeSlot } from "../../hooks/queries/use-billing";
import { showExpectedStateToast } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";

/**
 * Use as free org: confirm first, naming the org that locks in its place
 * (the one holding the free slot today), then swap. The strip clears on its
 * own once the orgs list says this org is working.
 */
export function TeamStatusClaimDialog({
  open,
  onOpenChange,
  org,
  orgs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  org: OrgSummary;
  orgs: OrgsList | undefined;
}) {
  const { t } = useTranslation("teams");
  const claim = useClaimFreeSlot();
  const addToast = useUIStore((s) => s.addToast);
  const holder = orgs?.freeOrg?.orgSlug;
  const other =
    holder && holder !== org.slug
      ? orgs?.orgs.find((o) => o.slug === holder)?.name
      : undefined;

  const confirm = async () => {
    const result = await claim.mutateAsync();
    if (result.kind === "claimed") {
      addToast({
        title: t("status.claim.done", { org: org.name }),
        variant: "success",
      });
      return;
    }
    showExpectedStateToast(
      t(`status.claim.refused.${result.kind}.title`),
      t(`status.claim.refused.${result.kind}.body`),
    );
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="default"
      title={t("status.claim.title", { org: org.name })}
      description={
        other
          ? t("status.claim.bodySwap", { org: org.name, other })
          : t("status.claim.bodyFree", { org: org.name })
      }
      confirmLabel={t("status.actions.claimFree")}
      cancelLabel={t("status.claim.cancel")}
      pendingLabel={t("status.claim.pending")}
      onConfirm={confirm}
    />
  );
}

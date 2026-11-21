import type { OrgSummary, OrgsList } from "@houston/engine-adapter";
import type { ClaimFreeSlotResult } from "@houston/sdk";
import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useClaimFreeSlot } from "../../hooks/queries/use-billing";
import { showExpectedStateToast } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";

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
    let result: ClaimFreeSlotResult;
    try {
      result = await claim.mutateAsync();
    } catch {
      return;
    }
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

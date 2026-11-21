import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

export type PeopleConfirmKind = "selfLockout" | "everyone" | "specific";

export function AgentPeopleConfirm({
  kind,
  count,
  onCancel,
  onConfirm,
}: {
  kind: PeopleConfirmKind | null;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("teams");
  const copy =
    kind === "selfLockout"
      ? {
          title: t("share.selfLockout.title"),
          description: t("share.selfLockout.description"),
          confirmLabel: t("share.selfLockout.confirm"),
          cancelLabel: t("share.selfLockout.cancel"),
          variant: "destructive" as const,
        }
      : kind === "specific"
        ? {
            title: t("agentSettings.people.confirmSpecific.title"),
            description: t("agentSettings.people.confirmSpecific.description", {
              count,
            }),
            confirmLabel: t("agentSettings.people.confirmSpecific.confirm"),
            cancelLabel: t("agentSettings.people.confirmSpecific.cancel"),
            variant: "default" as const,
          }
        : {
            title: t("agentSettings.people.confirmEveryone.title"),
            description: t("agentSettings.people.confirmEveryone.description"),
            confirmLabel: t("agentSettings.people.confirmEveryone.confirm"),
            cancelLabel: t("agentSettings.people.confirmEveryone.cancel"),
            variant: "default" as const,
          };

  return (
    <ConfirmDialog
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      cancelLabel={copy.cancelLabel}
      variant={copy.variant}
      onConfirm={onConfirm}
    />
  );
}

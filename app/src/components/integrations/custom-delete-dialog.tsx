import { ConfirmDialog } from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";

/**
 * The remove confirm for a custom integration: destructive, named after the
 * integration. `integration === null` keeps it closed; the parent owns the
 * selection and the actual removal.
 */
export function CustomDeleteDialog({
  integration,
  onClose,
  onConfirm,
}: {
  integration: CustomIntegrationView | null;
  onClose: () => void;
  onConfirm: (integration: CustomIntegrationView) => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <ConfirmDialog
      open={integration !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("custom.delete.title", { name: integration?.name ?? "" })}
      description={t("custom.delete.description", {
        name: integration?.name ?? "",
      })}
      confirmLabel={t("custom.delete.confirm")}
      cancelLabel={t("custom.delete.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (integration) onConfirm(integration);
        onClose();
      }}
    />
  );
}

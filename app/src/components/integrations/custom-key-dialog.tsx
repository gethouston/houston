import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { useSubmitCustomCredential } from "../../hooks/queries";
import { useUIStore } from "../../stores/ui";
import { CustomCredentialForm } from "./custom-credential-form";
import { customAuthMethod } from "./custom-integrations-model";

interface CustomKeyDialogProps {
  /** The pending integration to credential, or null when the dialog is closed. */
  integration: CustomIntegrationView | null;
  onClose: () => void;
}

/**
 * The Integrations-page "Enter key" dialog: collects the secret for a `pending`
 * custom integration through the shared secure form. The secret goes straight
 * to the host's secret store (`submitCustomIntegrationCredential`), never any
 * visible surface. On success the dialog closes and a success toast fires; on
 * failure the mutation's `call()` wrapper already toasted, so the dialog stays
 * open with the Save button re-enabled for a retry (no silent failure).
 */
export function CustomKeyDialog({
  integration,
  onClose,
}: CustomKeyDialogProps) {
  const { t } = useTranslation("integrations");
  const addToast = useUIStore((s) => s.addToast);
  const submit = useSubmitCustomCredential();

  const authMethod = integration ? customAuthMethod(integration) : null;
  const name = integration?.name ?? "";

  const onSubmit = (values: Record<string, string>) => {
    if (!integration) return;
    submit.mutate(
      { slug: integration.slug, values },
      {
        onSuccess: () => {
          addToast({
            title: t("custom.keyDialog.savedToast", { name }),
            variant: "success",
          });
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open={integration !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("custom.keyDialog.title", { name })}</DialogTitle>
          <DialogDescription>
            {authMethod?.label ?? t("custom.keyDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <CustomCredentialForm
          // Remount per integration so a prior entry never leaks across opens.
          key={integration?.slug ?? "none"}
          authMethod={authMethod}
          submitting={submit.isPending}
          onSubmit={onSubmit}
          submitLabel={t("custom.keyDialog.save")}
          submittingLabel={t("custom.keyDialog.saving")}
          autoFocus
        />
      </DialogContent>
    </Dialog>
  );
}

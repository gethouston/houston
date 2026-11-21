import type { CustomIntegrationView } from "@houston/engine-adapter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useSubmitCustomCredential } from "../../hooks/queries";
import { useUIStore } from "../../stores/ui";
import { CustomCredentialForm } from "./custom-credential-form";
import { customAuthMethod } from "./custom-integrations-model";

interface CustomKeyDialogProps {
  integration: CustomIntegrationView | null;
  agentId?: string;
  onClose: () => void;
}

export function CustomKeyDialog({
  integration,
  agentId,
  onClose,
}: CustomKeyDialogProps) {
  const { t } = useTranslation("integrations");
  const addToast = useUIStore((s) => s.addToast);
  const submit = useSubmitCustomCredential(agentId);

  const authMethod = integration ? customAuthMethod(integration) : null;
  const name = integration?.name ?? "";

  const onSubmit = (values: Record<string, string>) => {
    if (!integration) return;
    submit.mutate(
      { slug: integration.slug, values },
      {
        onSuccess: (saved) => {
          if (saved.verified === false) {
            addToast({
              title: t("custom.keyDialog.savedUnverifiedToast", { name }),
              variant: "info",
            });
          } else {
            addToast({
              title: t("custom.keyDialog.savedToast", { name }),
              variant: "success",
            });
          }
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("custom.keyDialog.title", { name })}</DialogTitle>
          <DialogDescription>
            {authMethod?.label ?? t("custom.keyDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <CustomCredentialForm
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

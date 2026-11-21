import { FormDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  ApiKeyNameField,
  ApiKeyReveal,
  useApiKeyCreateFlow,
} from "./api-key-create-flow";

interface ApiKeyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApiKeyCreateDialog({
  open,
  onOpenChange,
}: ApiKeyCreateDialogProps) {
  const { t } = useTranslation("settings");
  const flow = useApiKeyCreateFlow();
  const { revealed } = flow;

  function close() {
    flow.clear();
    onOpenChange(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={
        revealed ? t("apiKeys.create.revealTitle") : t("apiKeys.create.title")
      }
      description={
        revealed
          ? t("apiKeys.create.revealSubtitle", { name: revealed.name })
          : t("apiKeys.create.subtitle")
      }
      primary={
        revealed
          ? { label: t("apiKeys.create.done") }
          : {
              label: t("apiKeys.create.submit"),
              onClick: async () => {
                await flow.submit();
                return false;
              },
              disabled: flow.name.trim().length === 0,
            }
      }
      secondary={revealed ? null : undefined}
      labels={{
        cancel: t("apiKeys.create.cancel"),
        close: t("apiKeys.dialogClose"),
      }}
    >
      {revealed ? (
        <ApiKeyReveal created={revealed} />
      ) : (
        <ApiKeyNameField flow={flow} autoFocus />
      )}
    </FormDialog>
  );
}

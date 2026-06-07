import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, DialogDescription, DialogTitle, Spinner } from "@houston-ai/core";
import { ConnectDialogShell } from "./connect-dialog-layout";
import {
  syncOpenRouterEditorActions,
  type OpenRouterModelsEditorActions,
} from "../../lib/openrouter-models-editor-sync";
import { OpenRouterModelsEditor } from "./openrouter-models-editor";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OpenRouterManageModelsDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("providers");
  const [actions, setActions] = useState<OpenRouterModelsEditorActions | null>(null);

  useEffect(() => {
    if (!open) setActions(null);
  }, [open]);

  const handleActionsReady = useCallback((next: OpenRouterModelsEditorActions | null) => {
    setActions((prev) => syncOpenRouterEditorActions(prev, next));
  }, []);

  const handleSaved = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ConnectDialogShell
        header={
          <>
            <DialogTitle>{t("openrouterConnect.manageModelsTitle")}</DialogTitle>
            <DialogDescription>{t("openrouterConnect.modelsDescription")}</DialogDescription>
          </>
        }
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("apiKeyConnect.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!actions?.canFinish || actions.saving}
              onClick={() => void actions?.onFinish()}
              className="gap-1.5"
            >
              {actions?.saving ? <Spinner className="size-3.5" /> : null}
              {actions?.saving ? t("openrouterConnect.savingModels") : t("openrouterConnect.finish")}
            </Button>
          </>
        }
      >
        {open ? (
          <OpenRouterModelsEditor
            showHeader={false}
            onSaved={handleSaved}
            onActionsReady={handleActionsReady}
          />
        ) : null}
      </ConnectDialogShell>
    </Dialog>
  );
}

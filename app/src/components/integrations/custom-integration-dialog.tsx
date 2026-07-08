import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { CustomIntegrationFields } from "./custom-integration-fields";
import {
  type CustomFieldError,
  type CustomFormValues,
  editCustomForm,
  emptyCustomForm,
  validateCreate,
  validateEdit,
} from "./custom-integration-model";
import { useCustomIntegrationFlow } from "./use-custom-integration-flow";

/** Create: no initial. Edit: the connection id + the fields we can prefill. */
export type CustomDialogTarget =
  | { mode: "create" }
  | { mode: "edit"; connectionId: string; name: string; description: string };

interface CustomIntegrationDialogProps {
  target: CustomDialogTarget | null;
  onClose: () => void;
  /** Agent context: auto-grant a newly created integration to this agent. */
  agentId?: string;
  autoGrant: boolean;
}

/**
 * The add / edit dialog for a custom API-key integration. Owns the form state,
 * runs the client-side validation (mirrors the gateway), and drives the flow
 * (create + auto-grant, or edit-as-patch). The API key is a password input; in
 * edit mode a blank key keeps the stored one. Errors surface via `call()`, so a
 * failed submit keeps the dialog open with the typed values intact.
 */
export function CustomIntegrationDialog({
  target,
  onClose,
  agentId,
  autoGrant,
}: CustomIntegrationDialogProps) {
  if (!target) return null;
  return (
    <CustomIntegrationDialogBody
      // Remount per target so switching create<->edit resets the form cleanly.
      key={target.mode === "edit" ? target.connectionId : "create"}
      target={target}
      onClose={onClose}
      agentId={agentId}
      autoGrant={autoGrant}
    />
  );
}

function CustomIntegrationDialogBody({
  target,
  onClose,
  agentId,
  autoGrant,
}: {
  target: CustomDialogTarget;
  onClose: () => void;
  agentId?: string;
  autoGrant: boolean;
}) {
  const { t } = useTranslation("integrations");
  const flow = useCustomIntegrationFlow({ agentId, autoGrant });
  const addToast = useUIStore((s) => s.addToast);
  const [values, setValues] = useState<CustomFormValues>(() =>
    target.mode === "edit"
      ? editCustomForm({ name: target.name, description: target.description })
      : emptyCustomForm(),
  );
  const [errorField, setErrorField] = useState<CustomFieldError | null>(null);

  const set = (patch: Partial<CustomFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrorField(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (flow.submitting) return;
    if (target.mode === "create") {
      const result = validateCreate(values);
      if (!result.ok) return setErrorField(result.field);
      try {
        await flow.create(result);
        addToast({ title: t("custom.created"), variant: "success" });
        onClose();
      } catch {
        // call() already surfaced the reason; keep the dialog open.
      }
      return;
    }
    const result = validateEdit(values);
    if (!result.ok) return setErrorField(result.field);
    try {
      await flow.update(target.connectionId, result.patch);
      onClose();
    } catch {
      // call() already surfaced the reason; keep the dialog open.
    }
  };

  const isEdit = target.mode === "edit";
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !flow.submitting && onClose()}
    >
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("custom.editTitle") : t("custom.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("custom.descriptionHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <CustomIntegrationFields
            values={values}
            set={set}
            errorField={errorField}
            mode={isEdit ? "edit" : "create"}
            disabled={flow.submitting}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={flow.submitting}
            >
              {t("custom.cancel")}
            </Button>
            <Button type="submit" disabled={flow.submitting}>
              {isEdit ? t("custom.saveEdit") : t("custom.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import { McpServerFields } from "./mcp-server-fields";
import {
  editMcpForm,
  emptyMcpForm,
  type McpFieldError,
  type McpFormValues,
  validateCreate,
  validateEdit,
} from "./mcp-server-model";
import { useMcpServerFlow } from "./use-mcp-server-flow";

/** Create: no initial. Edit: the connection id + the fields we can prefill. */
export type McpDialogTarget =
  | { mode: "create" }
  | { mode: "edit"; connectionId: string; name: string; description: string };

interface McpServerDialogProps {
  target: McpDialogTarget | null;
  onClose: () => void;
  /** Agent context: auto-grant a newly connected server to this agent. */
  agentId?: string;
  autoGrant: boolean;
}

/**
 * The add / edit dialog for a remote MCP server. Owns the form state, runs the
 * client-side validation (mirrors the gateway), and drives the flow (create +
 * auto-grant, or edit-as-patch). The secret is a password input; in edit mode a
 * blank secret keeps the stored one (auth mode `keep` leaves auth entirely
 * alone). Errors surface via `call()`, so a failed submit keeps the dialog open
 * with the typed values intact.
 */
export function McpServerDialog({
  target,
  onClose,
  agentId,
  autoGrant,
}: McpServerDialogProps) {
  if (!target) return null;
  return (
    <McpServerDialogBody
      // Remount per target so switching create<->edit resets the form cleanly.
      key={target.mode === "edit" ? target.connectionId : "create"}
      target={target}
      onClose={onClose}
      agentId={agentId}
      autoGrant={autoGrant}
    />
  );
}

function McpServerDialogBody({
  target,
  onClose,
  agentId,
  autoGrant,
}: {
  target: McpDialogTarget;
  onClose: () => void;
  agentId?: string;
  autoGrant: boolean;
}) {
  const { t } = useTranslation("integrations");
  const flow = useMcpServerFlow({ agentId, autoGrant });
  const addToast = useUIStore((s) => s.addToast);
  const [values, setValues] = useState<McpFormValues>(() =>
    target.mode === "edit"
      ? editMcpForm({ name: target.name, description: target.description })
      : emptyMcpForm(),
  );
  const [errorField, setErrorField] = useState<McpFieldError | null>(null);

  const set = (patch: Partial<McpFormValues>) => {
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
        addToast({ title: t("mcp.created"), variant: "success" });
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
            {isEdit ? t("mcp.editTitle") : t("mcp.addTitle")}
          </DialogTitle>
          <DialogDescription>{t("mcp.descriptionHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <McpServerFields
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
              {t("mcp.cancel")}
            </Button>
            <Button type="submit" disabled={flow.submitting}>
              {isEdit ? t("mcp.saveEdit") : t("mcp.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * `<ConfirmDialog />` — simple modal for destructive actions in the
 * checkpoints panel (Phase 5 of RFC #248). Local to the checkpoints
 * folder for now; if other panels need a confirm modal we can promote
 * it into `@houston-ai/core`.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
  variant = "default",
}: Props) {
  const { t } = useTranslation(["checkpoints", "common"]);
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg">
        <h3 className="text-base font-semibold mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground mb-5">{description}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("common:actions.cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className={`px-3 py-1.5 text-sm rounded-md ${
              variant === "destructive"
                ? "bg-red-500 text-white hover:bg-red-500/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            } disabled:opacity-50`}
          >
            {busy ? t("checkpoints:saving") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

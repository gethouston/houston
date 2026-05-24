import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@houston-ai/core";
import { Loader2, ExternalLink } from "lucide-react";
import type { ComposioAuthState } from "../hooks/use-composio-auth";

interface ComposioAuthDialogProps {
  state: ComposioAuthState;
  onClose: () => void;
  onReopenBrowser: () => void;
}

/**
 * Sign-in dialog for Composio. Always shows the login URL as a
 * clickable button as soon as `state.loginUrl` is set, so the user
 * can always manually open it even if the auto-open failed.
 */
export function ComposioAuthDialog({
  state,
  onClose,
  onReopenBrowser,
}: ComposioAuthDialogProps) {
  const { t } = useTranslation("integrations");
  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("authDialog.title")}</DialogTitle>
          <DialogDescription>{t("authDialog.description")}</DialogDescription>
        </DialogHeader>

        {state.phase === "waiting" && (
          <div className="flex items-center gap-3 py-2">
            <Loader2 className="size-4 text-muted-foreground animate-spin shrink-0" />
            <p className="text-sm text-muted-foreground">
              {t("authDialog.waiting")}
            </p>
          </div>
        )}

        {state.phase === "error" && state.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}

        {state.loginUrl && (
          <button
            onClick={onReopenBrowser}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-background text-foreground text-sm font-medium hover:bg-secondary transition-colors duration-200 self-start"
          >
            {t("authDialog.openInBrowser")}
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

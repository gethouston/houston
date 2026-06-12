import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@houston-ai/core";
import { Loader2, ExternalLink } from "lucide-react";
import type { ComposioAuthState } from "../hooks/use-composio-auth";

interface ComposioAuthDialogProps {
  state: ComposioAuthState;
  onClose: () => void;
  onReopenBrowser: () => void;
  /** Restart the whole sign-in flow. Shown in the error state because a
   *  timed-out login session is dead — reopening the old URL is useless,
   *  the user needs a fresh attempt. */
  onRetry: () => void;
}

/**
 * Sign-in dialog for Composio. While waiting, shows the login URL as a
 * clickable button (in case auto-open failed). On failure it swaps to an
 * actionable "Try again" that mints a fresh session.
 */
export function ComposioAuthDialog({
  state,
  onClose,
  onReopenBrowser,
  onRetry,
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
          <DialogDescription>
            {t("authDialog.description")}
          </DialogDescription>
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

        {/* While waiting, let the user re-open the live login URL if the
            auto-open failed. Hidden once we error: that session is dead. */}
        {state.phase === "waiting" && state.loginUrl && (
          <button
            onClick={onReopenBrowser}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-background text-foreground text-sm font-medium hover:bg-secondary transition-colors duration-200 self-start"
          >
            {t("authDialog.openInBrowser")}
            <ExternalLink className="size-3.5" />
          </button>
        )}

        {state.phase === "error" && (
          <button
            onClick={onRetry}
            className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors duration-200 self-start"
          >
            {t("authDialog.tryAgain")}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

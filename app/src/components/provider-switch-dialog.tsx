import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { Sparkles } from "lucide-react";
import type { ProviderHandoffMode } from "../lib/provider-switch";

interface ProviderSwitchDialogProps {
  open: boolean;
  /** Display name of the provider being switched TO. */
  providerName: string;
  /** How prior context will be carried over, which drives the copy. */
  mode: ProviderHandoffMode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Consent dialog shown before switching a live conversation to a different
 * provider. Both handoff modes ask first, because both spend tokens:
 *
 *  - `replay`    — the whole conversation is reloaded into the new provider
 *    verbatim, so the cost scales with the current conversation size.
 *  - `summarize` — the conversation is too big for the new provider's window, so
 *    it's summarized to fit (still spends tokens, and may lose some detail).
 *
 * The user must acknowledge the token/usage cost before the switch is staged.
 */
export function ProviderSwitchDialog({
  open,
  providerName,
  mode,
  onConfirm,
  onCancel,
}: ProviderSwitchDialogProps) {
  const { t } = useTranslation("chat");
  const isSummary = mode === "summarize";
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <div>
              <DialogTitle>
                {t("providerSwitch.title", { provider: providerName })}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {t(
                  isSummary
                    ? "providerSwitch.summaryBody"
                    : "providerSwitch.replayBody",
                  { provider: providerName },
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t("providerSwitch.cancel")}
          </Button>
          <Button onClick={onConfirm}>
            {t(
              isSummary
                ? "providerSwitch.summaryConfirm"
                : "providerSwitch.replayConfirm",
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

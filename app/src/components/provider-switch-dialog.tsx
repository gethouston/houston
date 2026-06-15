import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@houston-ai/core";
import type { ProviderHandoffMode } from "../lib/provider-switch";
import { ProviderGlyph } from "./shell/provider-logos";
import { RowCard } from "./cards/row-card";

interface ProviderSwitchDialogProps {
  open: boolean;
  /** Id of the provider being switched TO — drives the logo on the card. */
  providerId: string;
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
 * The dialog uses the shared `RowCard` and shows the TARGET provider's logo
 * (not a generic sparkle) so it reads as "switching to <this provider>".
 * The `sr-only` title/description satisfy the dialog's a11y contract while the
 * visible copy lives inside the card.
 */
export function ProviderSwitchDialog({
  open,
  providerId,
  providerName,
  mode,
  onConfirm,
  onCancel,
}: ProviderSwitchDialogProps) {
  const { t } = useTranslation("chat");
  const isSummary = mode === "summarize";
  const title = t("providerSwitch.title", { provider: providerName });
  const body = t(
    isSummary ? "providerSwitch.summaryBody" : "providerSwitch.replayBody",
    { provider: providerName },
  );
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{body}</DialogDescription>
        <RowCard
          media={<ProviderGlyph providerId={providerId} />}
          title={title}
          description={body}
        />
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

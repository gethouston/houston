import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ProviderHandoffMode } from "../lib/provider-switch";
import { providerName } from "../lib/providers";
import { RowCard } from "./cards/row-card";
import { ProviderGlyph } from "./shell/provider-logos";

interface ProviderSwitchDialogProps {
  open: boolean;
  providerId: string;
  mode: ProviderHandoffMode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ProviderSwitchDialog({
  open,
  providerId,
  mode,
  onConfirm,
  onCancel,
}: ProviderSwitchDialogProps) {
  const { t } = useTranslation("chat");
  const isSummary = mode === "summarize";
  const provider = providerName(providerId);
  const title = t("providerSwitch.title", { provider });
  const body = t(
    isSummary ? "providerSwitch.summaryBody" : "providerSwitch.replayBody",
    { provider },
  );
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{body}</DialogDescription>
        <RowCard
          size="md"
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

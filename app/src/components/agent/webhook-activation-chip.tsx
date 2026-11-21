import type {
  TriggerStatusItem,
  WebhookKeyReveal,
} from "@houston/engine-adapter";
import { AsyncButton, Button, ConfirmDialog } from "@houston-ai/core";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWebhookKeyAccess } from "../../hooks/use-webhook-key-access";
import { showExpectedStateToast } from "../../lib/error-toast";
import { tauriRoutines } from "../../lib/tauri";
import { webhookActivationState } from "./routine-trigger-maps";
import { webhookChipView } from "./webhook-chip-view";
import { WebhookKeyDialog } from "./webhook-key-dialog";

interface Props {
  agentId: string;
  routineId: string;
  createdBy: string | undefined;
  status: TriggerStatusItem | undefined;
}

export function WebhookActivationChip({
  agentId,
  routineId,
  createdBy,
  status,
}: Props) {
  const { t } = useTranslation("routines");
  const [revealed, setRevealed] = useState<WebhookKeyReveal | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const access = useWebhookKeyAccess(createdBy);

  const mint = useCallback(async () => {
    try {
      const key = await tauriRoutines.mintWebhookKey(agentId, routineId);
      if (!key) {
        showExpectedStateToast(
          t("webhook.unsupportedTitle"),
          t("webhook.unsupportedBody"),
        );
        return;
      }
      setRevealed(key);
    } catch {}
  }, [agentId, routineId, t]);

  const view = webhookChipView(webhookActivationState(status), access);
  const dialog = (
    <WebhookKeyDialog onClose={() => setRevealed(null)} revealed={revealed} />
  );
  const notice = view.notice && (
    <span className="max-w-[15rem] text-left text-ink-muted text-xs md:text-right">
      {view.notice === "owner_only"
        ? t("webhook.ownerOnly")
        : t("webhook.creatorOnly")}
    </span>
  );

  if (view.showCreate) {
    return (
      <>
        <AsyncButton onClick={mint} size="sm">
          {t("webhook.createAddress")}
        </AsyncButton>
        {dialog}
      </>
    );
  }

  if (view.active) {
    return (
      <>
        <span className="inline-flex flex-wrap items-center justify-start gap-2 md:justify-end">
          <span className="inline-flex items-center gap-1.5 font-medium text-success text-xs">
            <CheckCircle2 className="size-3.5 shrink-0" />
            {t("webhook.active")}
          </span>
          {view.showRotate && (
            <Button
              className="-mr-2"
              onClick={() => setConfirmOpen(true)}
              size="sm"
              variant="ghost"
            >
              {t("webhook.rotate")}
            </Button>
          )}
          {notice}
        </span>
        <ConfirmDialog
          cancelLabel={t("webhook.rotateConfirm.cancel")}
          confirmLabel={t("webhook.rotateConfirm.confirm")}
          description={t("webhook.rotateConfirm.body")}
          onConfirm={() => {
            setConfirmOpen(false);
            void mint();
          }}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title={t("webhook.rotateConfirm.title")}
          variant="destructive"
        />
        {dialog}
      </>
    );
  }

  if (view.alert) {
    return (
      <span className="inline-flex max-w-[15rem] items-center gap-1.5 text-right font-medium text-warning text-xs">
        <AlertTriangle className="size-3.5 shrink-0" />
        {status?.detail ?? t("trigger.status.error")}
      </span>
    );
  }

  if (notice) return notice;

  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-ink-muted text-xs">
      <Loader2 className="size-3.5 shrink-0 animate-spin" />
      {t("chat.activation.checking")}
    </span>
  );
}

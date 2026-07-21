/**
 * The webhook half of the routine activation header. Where a Composio trigger
 * shows checking -> activating -> active, an incoming-webhook routine needs the
 * user to mint its address before it can fire: `needs_key` renders a primary
 * "Create webhook address" action, `active` shows the live state plus an
 * always-visible "New key" (rotate) action. Both mint through the same reveal
 * dialog; rotating asks for confirmation first, since it invalidates the old
 * secret. A host too old to mint returns null — surfaced as an honest toast.
 */
import { AsyncButton, Button, ConfirmDialog } from "@houston-ai/core";
import type {
  TriggerStatusItem,
  WebhookKeyReveal,
} from "@houston-ai/engine-client";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { showExpectedStateToast } from "../../lib/error-toast";
import { tauriRoutines } from "../../lib/tauri";
import { webhookActivationState } from "./routine-trigger-maps";
import { WebhookKeyDialog } from "./webhook-key-dialog";

interface Props {
  agentId: string;
  routineId: string;
  status: TriggerStatusItem | undefined;
}

export function WebhookActivationChip({ agentId, routineId, status }: Props) {
  const { t } = useTranslation("routines");
  const [revealed, setRevealed] = useState<WebhookKeyReveal | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mint = useCallback(async () => {
    try {
      const key = await tauriRoutines.mintWebhookKey(agentId, routineId);
      // Null (not an error): the host predates webhook minting. `call()` already
      // surfaces genuine failures, so we only handle the feature-gap here.
      if (!key) {
        showExpectedStateToast(
          t("webhook.unsupportedTitle"),
          t("webhook.unsupportedBody"),
        );
        return;
      }
      setRevealed(key);
    } catch {
      // A real failure already surfaced (toast + report) via tauri `call()`;
      // swallowing the rethrow only stops a duplicate unhandled rejection.
    }
  }, [agentId, routineId, t]);

  const state = webhookActivationState(status);
  const dialog = (
    <WebhookKeyDialog onClose={() => setRevealed(null)} revealed={revealed} />
  );

  if (state === "needs_key") {
    return (
      <>
        <AsyncButton onClick={mint} size="sm">
          {t("webhook.createAddress")}
        </AsyncButton>
        {dialog}
      </>
    );
  }

  if (state === "active") {
    return (
      <>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-success text-xs">
            <CheckCircle2 className="size-3.5 shrink-0" />
            {t("webhook.active")}
          </span>
          <Button
            className="-mr-2"
            onClick={() => setConfirmOpen(true)}
            size="sm"
            variant="ghost"
          >
            {t("webhook.rotate")}
          </Button>
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

  if (state === "alert") {
    return (
      <span className="inline-flex max-w-[15rem] items-center gap-1.5 text-right font-medium text-warning text-xs">
        <AlertTriangle className="size-3.5 shrink-0" />
        {status?.detail ?? t("trigger.status.error")}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-ink-muted text-xs">
      <Loader2 className="size-3.5 shrink-0 animate-spin" />
      {t("chat.activation.checking")}
    </span>
  );
}

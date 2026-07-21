import type { StepChrome } from "@houston-ai/chat";
import { InteractionModal, InteractionModalTitle } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { ArrowLeft, Webhook } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WebhookPick } from "./types";

interface IntakeWebhookCardProps {
  /** The stepper chrome (pager + dismiss X) the intake hands this re-hosted
   *  step so it renders the SAME shell as a real ask_user card. */
  chrome: StepChrome;
  /** Back to the wake question (this card is only reachable via that choice). */
  onBack: () => void;
  /** Commit the incoming-webhook wake and complete the intake. */
  onComplete: (pick: WebhookPick) => void;
}

/**
 * The incoming-webhook wake card, re-hosted from the old wizard step into the
 * in-chat {@link InteractionModal} shell: a short, plain-words explainer of what
 * the user is choosing. Nothing is collected here — the unique web address and
 * secret key are minted (and revealed once) later, from the setup chat header —
 * so this card only frames the choice and commits it.
 */
export function IntakeWebhookCard({
  chrome,
  onBack,
  onComplete,
}: IntakeWebhookCardProps): ReactNode {
  const { t } = useTranslation("routines");
  return (
    <InteractionModal
      contentKey="webhook"
      disabled={chrome.disabled}
      dismissLabel={chrome.dismissLabel}
      onDismiss={chrome.onDismiss}
      pager={chrome.pager}
      title={
        <InteractionModalTitle
          className="truncate"
          icon={<Webhook className="size-4 shrink-0 text-ink-muted" />}
        >
          {t("wizard.webhookTitle")}
        </InteractionModalTitle>
      }
      body={
        <p className="text-ink-muted text-sm leading-snug">
          {t("wizard.webhookDescription")}
        </p>
      }
      footer={
        <>
          <Button
            className="gap-1.5 text-ink-muted"
            disabled={chrome.disabled}
            onClick={onBack}
            size="sm"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="size-3.5" />
            {t("common:actions.back")}
          </Button>
          <Button
            disabled={chrome.disabled}
            onClick={() => onComplete({ kind: "webhook" })}
            size="sm"
            type="button"
          >
            {t("wizard.build")}
          </Button>
        </>
      }
    />
  );
}

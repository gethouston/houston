import type { StepChrome } from "@houston-ai/chat";
import { InteractionModal, InteractionModalTitle } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { ArrowLeft, Webhook } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WebhookPick } from "./types";

interface IntakeWebhookCardProps {
  chrome: StepChrome;
  onBack: () => void;
  onComplete: (pick: WebhookPick) => void;
}

export function IntakeWebhookCard({
  chrome,
  onBack,
  onComplete,
}: IntakeWebhookCardProps): ReactNode {
  const { t } = useTranslation("routines");
  return (
    <InteractionModal
      contentKey="webhook"
      collapseLabel={chrome.collapseLabel}
      disabled={chrome.disabled}
      dismissLabel={chrome.dismissLabel}
      expandLabel={chrome.expandLabel}
      onDismiss={chrome.onDismiss}
      onOpenChange={chrome.onOpenChange}
      open={chrome.open}
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

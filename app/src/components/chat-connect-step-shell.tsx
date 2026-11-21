import {
  InlineTextRow,
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
  type StepFooterApi,
} from "@houston-ai/chat";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChatStepDeclineButton } from "./chat-step-decline-button";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

export type StepDraftApi = Pick<StepFooterApi, "draft" | "onDraftChange">;

interface Props extends StepChrome, StepDraftApi {
  stepId: string;
  icon: ReactNode;
  title: ReactNode;
  reason: ReactNode;
  done: boolean;
  doneLabel?: string;
  children?: ReactNode;
  cta?: ReactNode;
  busy: boolean;
  onDecline: (message?: string) => void;
  onEnter?: () => void;
  stepActive?: boolean;
  locked?: boolean;
}

export function ChatConnectStepShell({
  stepId,
  icon,
  title,
  reason,
  done,
  doneLabel,
  children,
  cta,
  busy,
  draft,
  onDraftChange,
  onDecline,
  onEnter,
  stepActive = true,
  locked = false,
  pager,
  onDismiss,
  dismissLabel,
  collapseLabel,
  expandLabel,
  disabled,
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation("chat");

  useInteractionStepKeys({
    enabled: stepActive && open && !busy && !done,
    onEnter,
    onEscape: locked ? () => {} : () => onDecline(),
  });

  return (
    <InteractionModal
      collapseLabel={collapseLabel}
      collapsedHint={reason}
      contentKey={stepId}
      disabled={disabled}
      dismissLabel={dismissLabel}
      expandLabel={expandLabel}
      onDismiss={locked ? undefined : onDismiss}
      onOpenChange={onOpenChange}
      open={open}
      pager={locked ? undefined : pager}
      title={
        <InteractionModalTitle className="flex-1 truncate" icon={icon}>
          {title}
        </InteractionModalTitle>
      }
      body={
        done && doneLabel !== undefined ? (
          <span className="inline-flex items-center gap-1 font-medium text-success text-sm">
            <Check className="size-3.5" />
            {doneLabel}
          </span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-balance text-ink text-sm leading-snug">
              {reason}
            </p>
            {children}
          </div>
        )
      }
      footer={
        done ? undefined : locked ? (
          cta
        ) : (
          <>
            <ChatStepDeclineButton
              disabled={busy}
              escLabel={t("interaction.esc")}
              label={t("interaction.skip")}
              onClick={() => onDecline()}
            />
            {cta}
          </>
        )
      }
      trailing={
        done || locked ? undefined : (
          <InlineTextRow
            disabled={busy}
            onSubmit={(text) => {
              onDecline(text);
              onDraftChange("");
            }}
            onValueChange={onDraftChange}
            placeholder={t("interaction.declinePlaceholder")}
            sendLabel={t("questionCard.send")}
            value={draft}
          />
        )
      }
    />
  );
}

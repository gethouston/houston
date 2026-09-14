import {
  InlineTextRow,
  InteractionModal,
  InteractionModalTitle,
  type StepChrome,
} from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { providerName } from "../lib/providers";
import { ChatStepDeclineButton } from "./chat-step-decline-button";
import { ProviderConnectionDialogs } from "./provider-browser/provider-connection-dialogs";
import { ProviderGlyph } from "./shell/provider-logos";
import { useChatProviderConnect } from "./use-chat-provider-connect";
import { useInteractionStepKeys } from "./use-interaction-step-keys";

interface Props extends StepChrome {
  stepId: string;
  providerId: string;
  reason?: string;
  revisited: boolean;
  onConnected: (name: string) => void;
  onSkip: (name: string, message?: string) => void;
}

/** The model names an account; only the existing secure dialogs receive secrets. */
export function ChatProviderConnectInteractionCard({
  stepId,
  providerId,
  reason,
  revisited,
  onConnected,
  onSkip,
  ...chrome
}: Props) {
  const { t } = useTranslation("chat");
  const flow = useChatProviderConnect({ providerId, revisited, onConnected });
  const name = flow.provider?.name ?? providerName(providerId);
  const connected = flow.state === "connected";
  const busy = chrome.disabled || flow.connecting || flow.dialogOpen;
  const canConnect = !!flow.provider && !connected;
  const skip = (text?: string) => onSkip(name, text);
  const reasonLine = reason ?? t("interaction.providerReason", { name });
  useInteractionStepKeys({
    enabled: flow.active && chrome.open && !busy,
    onEnter: canConnect ? flow.start : undefined,
    onEscape: connected ? undefined : () => skip(),
  });

  return (
    <>
      {flow.active && (
        <ProviderConnectionDialogs
          {...flow.dialogProps}
          onConnectionCancelled={flow.cancelObservation}
        />
      )}
      <InteractionModal
        {...chrome}
        contentKey={stepId}
        collapsedHint={reasonLine}
        title={
          <InteractionModalTitle
            icon={<ProviderGlyph providerId={providerId} />}
          >
            {t("interaction.connectTitle", { app: name })}
          </InteractionModalTitle>
        }
        body={
          <div className="flex flex-col gap-2">
            {connected ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="size-4" />
                {t("composio.connected")}
              </span>
            ) : (
              <p className="text-balance text-sm text-ink">{reasonLine}</p>
            )}
            {!flow.provider && (
              <p className="text-sm text-ink-muted">
                {t("interaction.providerUnavailable")}
              </p>
            )}
            {flow.connecting && (
              <p className="text-xs text-ink-muted">
                {t("composio.waitingToConnect")}
              </p>
            )}
          </div>
        }
        footer={
          !connected ? (
            <>
              <ChatStepDeclineButton
                disabled={busy}
                escLabel={t("interaction.esc")}
                label={t("interaction.skip")}
                onClick={() => skip()}
              />
              {flow.connecting ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={flow.cancel}
                  disabled={chrome.disabled}
                >
                  {t("interaction.cancelConnection")}
                </Button>
              ) : canConnect ? (
                <Button size="sm" onClick={flow.start} disabled={busy}>
                  {flow.state === "checking" && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {t("composio.connect")}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
        trailing={
          !connected ? (
            <InlineTextRow
              disabled={busy}
              onSubmit={skip}
              placeholder={t("interaction.declinePlaceholder")}
              sendLabel={t("questionCard.send")}
            />
          ) : undefined
        }
      />
    </>
  );
}

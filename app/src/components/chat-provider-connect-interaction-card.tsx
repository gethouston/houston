import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { providerName } from "../lib/providers";
import { ChatConnectStepShell } from "./chat-connect-step-shell";
import { ProviderConnectionDialogs } from "./provider-browser/provider-connection-dialogs";
import { ProviderGlyph } from "./shell/provider-logos";
import { useChatProviderConnect } from "./use-chat-provider-connect";

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
  const flow = useChatProviderConnect({
    stepId,
    providerId,
    revisited,
    onConnected,
  });
  const name = flow.provider?.name ?? providerName(providerId);
  const connected = flow.state === "connected";
  const busy = chrome.disabled || flow.connecting || flow.dialogOpen;
  const canConnect = !!flow.provider && !connected;
  const skip = (text?: string) => onSkip(name, text);

  return (
    <>
      {flow.active && (
        <ProviderConnectionDialogs
          {...flow.dialogProps}
          onConnectionCancelled={flow.cancelObservation}
        />
      )}
      <ChatConnectStepShell
        {...chrome}
        busy={busy}
        cta={
          flow.connecting ? (
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
              {t("composio.connect")}
            </Button>
          ) : undefined
        }
        done={connected}
        doneLabel={t("composio.connected")}
        icon={
          <ProviderGlyph className="size-5 shrink-0" providerId={providerId} />
        }
        onDecline={skip}
        onEnter={canConnect ? flow.start : undefined}
        reason={reason ?? t("interaction.providerReason", { name })}
        stepActive={flow.active}
        stepId={stepId}
        title={t("interaction.connectTitle", { app: name })}
      >
        {!flow.provider && (
          <p className="text-ink-muted text-sm">
            {t("interaction.providerUnavailable")}
          </p>
        )}
        {flow.connecting && (
          <p className="text-ink-muted text-xs">
            {t("composio.waitingToConnect")}
          </p>
        )}
      </ChatConnectStepShell>
    </>
  );
}

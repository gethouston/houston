import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  forgetProviderConnectStep,
  providerConnectStepKey,
} from "../lib/provider-connect-step-memory";
import { providerName } from "../lib/providers";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import { ProviderConnectionDialogs } from "./provider-browser/provider-connection-dialogs";
import { ProviderGlyph } from "./shell/provider-logos";
import { useChatProviderConnect } from "./use-chat-provider-connect";

interface Props extends StepChrome, StepDraftApi {
  stepId: string;
  /** The agent whose chat holds the card. */
  agentId: string;
  /** The conversation the interaction belongs to, `null` before its id lands. */
  conversationId: string | null;
  providerId: string;
  reason?: string;
  revisited: boolean;
  onConnected: (name: string) => void;
  onSkip: (name: string, message?: string) => void;
}

/** The model names an account; only the existing secure dialogs receive secrets. */
export function ChatProviderConnectInteractionCard({
  stepId,
  agentId,
  conversationId,
  providerId,
  reason,
  revisited,
  onConnected,
  onSkip,
  ...chrome
}: Props) {
  const { t } = useTranslation("chat");
  // The step id alone names the first provider request of EVERY turn ("p1"), so
  // the memory is keyed by the whole request (`provider-connect-step-memory.ts`).
  const stepKey = useMemo(
    () =>
      providerConnectStepKey({ agentId, conversationId, providerId, stepId }),
    [agentId, conversationId, providerId, stepId],
  );
  const flow = useChatProviderConnect({
    stepKey,
    providerId,
    revisited,
    onConnected,
  });
  const name = flow.provider?.name ?? providerName(providerId);
  const connected = flow.state === "connected";
  const busy = chrome.disabled || flow.connecting || flow.dialogOpen;
  const canConnect = !!flow.provider && !connected;
  // An answered step is never read again: drop what the app run remembers of it
  // so a later request in this conversation starts live.
  const skip = (text?: string) => {
    forgetProviderConnectStep(stepKey);
    onSkip(name, text);
  };

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
              {flow.probing && <Loader2 className="size-4 animate-spin" />}
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
        onDismiss={
          chrome.onDismiss &&
          (() => {
            forgetProviderConnectStep(stepKey);
            chrome.onDismiss?.();
          })
        }
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

import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import {
  connectStepAutoContinues,
  connectStepDone,
} from "./integration-connect-card-state";
import { AppLogo } from "./integrations";
import { CuratedConnectDialog } from "./integrations/curated-connect-dialog";
import { useChatConnect } from "./use-chat-connect";

interface ChatConnectInteractionCardProps extends StepChrome, StepDraftApi {
  stepId: string;
  toolkit: string;
  agentId: string;
  accountScope?: boolean;
  reason?: string;
  onConnected: (toolkit: string, appName: string) => void;
  onSkip: (toolkit: string, appName: string, message?: string) => void;
  revisited: boolean;
  reconnect?: boolean;
  refusedAt?: string;
}

export function ChatConnectInteractionCard({
  toolkit,
  agentId,
  accountScope,
  reason,
  onConnected,
  onSkip,
  revisited,
  stepId,
  reconnect = false,
  refusedAt,
  ...chrome
}: ChatConnectInteractionCardProps) {
  const { t } = useTranslation("chat");
  const [reconnected, setReconnected] = useState(false);
  const {
    app,
    isConnected,
    connecting,
    startConnect,
    curatedDialog,
    curatedProviderConnect,
    closeCuratedDialog,
  } = useChatConnect({
    toolkit,
    agentId,
    accountScope,
    onConnected: reconnect
      ? (slug, appName) => {
          setReconnected(true);
          onConnected(slug, appName);
        }
      : onConnected,
    autoContinueWhenConnected: connectStepAutoContinues({
      reconnect,
      refusedAt,
      revisited,
    }),
    ...(reconnect && refusedAt ? { connectedAfter: refusedAt } : {}),
  });
  const done = connectStepDone({
    reconnect,
    refusedAt,
    isConnected,
    reconnectedHere: reconnected,
  });

  return (
    <>
      <CuratedConnectDialog
        agentId={agentId}
        curated={curatedDialog}
        providerConnect={curatedProviderConnect}
        onClose={closeCuratedDialog}
      />
      <ChatConnectStepShell
        {...chrome}
        busy={connecting}
        cta={
          done ? undefined : (
            <Button
              className="gap-1.5"
              disabled={connecting}
              onClick={() => void startConnect()}
              size="sm"
              type="button"
            >
              {connecting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t("composio.connecting")}
                </>
              ) : (
                <>
                  {reconnect ? t("composio.reconnect") : t("composio.connect")}
                  <CornerDownLeft className="size-3.5 opacity-70" />
                </>
              )}
            </Button>
          )
        }
        done={done}
        doneLabel={t("composio.connected")}
        icon={<AppLogo className="shrink-0" display={app} size="sm" />}
        onDecline={(text) => onSkip(toolkit, app.name, text)}
        onEnter={() => void startConnect()}
        reason={
          reason ??
          (reconnect
            ? t("interaction.reconnectReasonFallback", { app: app.name })
            : t("interaction.connectReasonFallback", { app: app.name }))
        }
        stepId={stepId}
        title={
          reconnect
            ? t("interaction.reconnectTitle", { app: app.name })
            : t("interaction.connectTitle", { app: app.name })
        }
      >
        {connecting && (
          <p className="text-ink-muted text-xs">
            {t("composio.waitingToConnect")}
          </p>
        )}
      </ChatConnectStepShell>
    </>
  );
}

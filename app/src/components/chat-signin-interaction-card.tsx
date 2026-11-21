import type { StepChrome } from "@houston-ai/chat";
import { Button, HoustonHelmet } from "@houston-ai/core";
import { CornerDownLeft, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import { useIntegrationsGate } from "./integrations/use-integrations-gate";

interface ChatSigninInteractionCardProps extends StepChrome, StepDraftApi {
  stepId: string;
  reason?: string;
  onSignedIn: () => void;
  onSkip: (message?: string) => void;
  revisited: boolean;
}

export function ChatSigninInteractionCard({
  reason,
  onSignedIn,
  onSkip,
  revisited,
  stepId,
  ...chrome
}: ChatSigninInteractionCardProps) {
  const { t } = useTranslation("chat");
  const gate = useIntegrationsGate();

  const fired = useRef(false);
  const signInInitiated = useRef(false);
  useEffect(() => {
    if (gate.kind !== "ready" || fired.current) return;
    if (revisited && !signInInitiated.current) return;
    fired.current = true;
    onSignedIn();
  }, [gate.kind, onSignedIn, revisited]);

  const signedIn = gate.kind === "ready";
  const signingIn = gate.kind === "signin" && gate.signingIn;
  const pending = signingIn || gate.kind === "loading" || gate.kind === "ready";

  const doSignIn = () => {
    if (gate.kind === "signin") {
      signInInitiated.current = true;
      gate.signIn();
    }
  };

  return (
    <ChatConnectStepShell
      {...chrome}
      busy={pending}
      done={signedIn}
      cta={
        signedIn ? undefined : (
          <Button
            className="gap-1.5"
            disabled={pending || gate.kind !== "signin"}
            onClick={doSignIn}
            size="sm"
            type="button"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("interaction.signin")}
            {pending ? null : (
              <CornerDownLeft className="size-3.5 opacity-70" />
            )}
          </Button>
        )
      }
      icon={
        <span className="flex size-6 shrink-0 items-center justify-center text-ink">
          <HoustonHelmet color="currentColor" size={22} />
        </span>
      }
      onDecline={onSkip}
      onEnter={!signedIn && gate.kind === "signin" ? doSignIn : undefined}
      reason={reason ?? t("interaction.signinTitle")}
      stepId={stepId}
      title={t("interaction.signinAppName")}
    >
      <p className="text-ink-muted text-sm">
        {t("interaction.signinDescription")}
      </p>
    </ChatConnectStepShell>
  );
}

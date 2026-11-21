import type { StepChrome } from "@houston-ai/chat";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import { CredentialStepCta } from "./chat-credential-step-cta";
import {
  CredentialStepFields,
  CredentialStepIcon,
} from "./chat-credential-step-fields";
import { useChatCredentialStep } from "./use-chat-credential-step";

interface ChatCredentialInteractionCardProps extends StepChrome, StepDraftApi {
  stepId: string;
  agentId: string;
  toolkit: string;
  reason?: string;
  onSaved: (name: string, mode: "key" | "oauth") => void;
  onSkip: (name: string, mode: "key" | "oauth", message?: string) => void;
  revisited: boolean;
}

export function ChatCredentialInteractionCard({
  stepId,
  agentId,
  toolkit,
  reason,
  onSaved,
  onSkip,
  revisited,
  ...chrome
}: ChatCredentialInteractionCardProps) {
  const { t } = useTranslation("chat");
  const step = useChatCredentialStep({ agentId, toolkit, revisited, onSaved });
  const [ready, setReady] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const formId = `credential-form-${stepId}`;

  return (
    <ChatConnectStepShell
      {...chrome}
      busy={step.busy}
      cta={
        <CredentialStepCta
          formId={formId}
          missing={step.missing}
          mode={step.mode}
          onSignIn={step.startSignIn}
          ready={ready}
          retry={step.retry}
          signInPending={step.signInPending}
          submitting={step.submitting}
        />
      }
      done={step.isSaved}
      doneLabel={t(step.oauth ? "credential.signedIn" : "credential.saved")}
      icon={
        <CredentialStepIcon
          iconUrl={iconFailed ? null : step.iconUrl}
          mode={step.mode}
          onIconError={() => setIconFailed(true)}
        />
      }
      onDecline={(text) => onSkip(step.name, step.mode, text)}
      reason={
        step.missing
          ? t("credential.missingBody", { name: step.name })
          : (reason ??
            t(step.oauth ? "credential.signInTitle" : "credential.title", {
              name: step.name,
            }))
      }
      stepId={stepId}
      title={step.name}
    >
      <CredentialStepFields
        authMethod={step.authMethod}
        awaitingGrant={step.awaitingGrant}
        blockedUrl={step.blockedUrl}
        formId={formId}
        missing={step.missing}
        mode={step.mode}
        onOpenBlocked={step.openBlocked}
        onReadyChange={setReady}
        onSubmit={step.save}
        signInFailed={step.signInFailed}
        submitting={step.submitting}
      />
    </ChatConnectStepShell>
  );
}

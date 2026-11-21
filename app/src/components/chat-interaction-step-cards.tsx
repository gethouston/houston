import type { ChatInteractionCardProps } from "@houston-ai/chat";
import { apiKeyNameAgentId } from "../lib/hands-on-screens";
import type { NonPlanReadyStep } from "../lib/plan-ready";
import { ChatConnectInteractionCard } from "./chat-connect-interaction-card";
import { ChatCredentialInteractionCard } from "./chat-credential-interaction-card";
import { ChatHandsOnInteractionCard } from "./chat-hands-on-interaction-card";
import type { InteractionOutcomes } from "./chat-interaction-reply";
import { ChatProviderConnectInteractionCard } from "./chat-provider-connect-interaction-card";
import { ChatSigninInteractionCard } from "./chat-signin-interaction-card";

type StepRenderers = Pick<
  ChatInteractionCardProps,
  "renderCustom" | "renderSignin" | "renderConnect" | "renderCredential"
>;

export function interactionStepCards(args: {
  steps: readonly NonPlanReadyStep[];
  agentId: string;
  conversationId: string | null;
  accountScope: boolean;
  outcomes: InteractionOutcomes;
}): StepRenderers {
  const { steps, agentId, conversationId, accountScope, outcomes } = args;
  return {
    renderCustom: (step, api) => {
      const request = steps.find((item) => item.id === step.id);
      if (request?.kind === "hands_on")
        return (
          <ChatHandsOnInteractionCard
            {...api}
            key={step.id}
            stepId={step.id}
            surface={request.surface}
            targetAgentId={request.agentId}
            keyNameAgentId={apiKeyNameAgentId(steps)}
            managerChat={accountScope}
            reason={request.reason}
            onFinished={(name) => {
              outcomes.handsOn.set(step.id, { name, finished: true });
              api.onDone();
            }}
            onSkip={(name, message) => {
              outcomes.handsOn.set(step.id, { name, finished: false, message });
              api.onSkip();
            }}
          />
        );
      if (request?.kind !== "provider_connect") return null;
      return (
        <ChatProviderConnectInteractionCard
          {...api}
          key={step.id}
          stepId={step.id}
          agentId={agentId}
          conversationId={conversationId}
          providerId={request.provider}
          reason={request.reason}
          onConnected={(name) => {
            outcomes.connects.set(step.id, { name, connected: true });
            api.onDone();
          }}
          onSkip={(name, message) => {
            outcomes.connects.set(step.id, {
              name,
              connected: false,
              message,
            });
            api.onSkip();
          }}
        />
      );
    },
    renderSignin: (step, api) => (
      <ChatSigninInteractionCard
        {...api}
        key={step.id}
        stepId={step.id}
        reason={step.reason}
        onSignedIn={() => {
          outcomes.signin = "signedIn";
          api.onSignedIn();
        }}
        onSkip={(message) => {
          outcomes.signin = "skipped";
          outcomes.signinDeclineText = message;
          api.onSkip();
        }}
      />
    ),
    renderConnect: (step, api) => (
      <ChatConnectInteractionCard
        {...api}
        key={step.id}
        stepId={step.id}
        agentId={agentId}
        reason={step.reason}
        reconnect={step.reconnect === true}
        refusedAt={step.refusedAt}
        onConnected={(_toolkit, appName) => {
          outcomes.connects.set(step.id, { name: appName, connected: true });
          api.onConnected();
        }}
        onSkip={(_toolkit, appName, message) => {
          outcomes.connects.set(step.id, {
            name: appName,
            connected: false,
            message,
          });
          api.onSkip();
        }}
        toolkit={step.toolkit}
        accountScope={accountScope}
      />
    ),
    renderCredential: (step, api) => (
      <ChatCredentialInteractionCard
        {...api}
        key={step.id}
        stepId={step.id}
        agentId={agentId}
        toolkit={step.toolkit}
        reason={step.reason}
        onSaved={(name, mode) => {
          outcomes.credentialModes.set(name, mode);
          outcomes.credentials.set(step.id, { name, saved: true });
          api.onSaved();
        }}
        onSkip={(name, mode, message) => {
          outcomes.credentialModes.set(name, mode);
          outcomes.credentials.set(step.id, { name, saved: false, message });
          api.onSkip();
        }}
      />
    ),
  };
}

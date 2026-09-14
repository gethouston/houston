import type { ChatInteractionCardProps } from "@houston-ai/chat";
import type { NonPlanReadyStep } from "../lib/plan-ready";
import { ChatConnectInteractionCard } from "./chat-connect-interaction-card";
import { ChatCredentialInteractionCard } from "./chat-credential-interaction-card";
import type { InteractionOutcomes } from "./chat-interaction-reply";
import { ChatProviderConnectInteractionCard } from "./chat-provider-connect-interaction-card";
import { ChatSigninInteractionCard } from "./chat-signin-interaction-card";

type StepRenderers = Pick<
  ChatInteractionCardProps,
  "renderCustom" | "renderSignin" | "renderConnect" | "renderCredential"
>;

/**
 * The app-owned bodies for every step kind the stepper cannot render itself
 * (ui/chat is auth- and Composio-unaware, so it hands each one back here).
 *
 * Every renderer records the step's outcome and ADVANCES only: the composed
 * reply fires once, at completion. Starting a turn from a single step would
 * tear the card down before its later siblings could be walked.
 */
export function interactionStepCards(args: {
  /** The protocol steps, so a custom step can be matched back to its request. */
  steps: readonly NonPlanReadyStep[];
  agentId: string;
  /** The AI Manager connects for the ACCOUNT, an agent chat for its agent. */
  accountScope: boolean;
  outcomes: InteractionOutcomes;
}): StepRenderers {
  const { steps, agentId, accountScope, outcomes } = args;
  return {
    renderCustom: (step, api) => {
      const request = steps.find((item) => item.id === step.id);
      if (request?.kind !== "provider_connect") return null;
      return (
        <ChatProviderConnectInteractionCard
          {...api}
          key={step.id}
          stepId={step.id}
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
        key={step.id}
        stepId={step.id}
        pager={api.pager}
        onDismiss={api.onDismiss}
        dismissLabel={api.dismissLabel}
        collapseLabel={api.collapseLabel}
        expandLabel={api.expandLabel}
        disabled={api.disabled}
        open={api.open}
        onOpenChange={api.onOpenChange}
        reason={step.reason}
        revisited={api.revisited}
        onSignedIn={() => {
          // FINAL state: signed in wins over any earlier skip.
          outcomes.signin = "signedIn";
          api.onSignedIn();
        }}
        onSkip={(message) => {
          // A message makes the sequence resume visibly, so the agent (and the
          // transcript) hears the redirection.
          outcomes.signin = "skipped";
          outcomes.signinDeclineText = message;
          api.onSkip();
        }}
      />
    ),
    renderConnect: (step, api) => (
      <ChatConnectInteractionCard
        key={step.id}
        stepId={step.id}
        pager={api.pager}
        onDismiss={api.onDismiss}
        dismissLabel={api.dismissLabel}
        collapseLabel={api.collapseLabel}
        expandLabel={api.expandLabel}
        disabled={api.disabled}
        open={api.open}
        onOpenChange={api.onOpenChange}
        agentId={agentId}
        reason={step.reason}
        revisited={api.revisited}
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
        key={step.id}
        stepId={step.id}
        agentId={agentId}
        pager={api.pager}
        onDismiss={api.onDismiss}
        dismissLabel={api.dismissLabel}
        collapseLabel={api.collapseLabel}
        expandLabel={api.expandLabel}
        disabled={api.disabled}
        open={api.open}
        onOpenChange={api.onOpenChange}
        toolkit={step.toolkit}
        reason={step.reason}
        revisited={api.revisited}
        onSaved={(name, mode) => {
          outcomes.credentialModes.set(name, mode);
          outcomes.credentials.set(step.id, { name, saved: true });
          api.onSaved();
        }}
        onSkip={(name, mode, message) => {
          // The agent hears "Skipped adding the X key." (or the sign-in /
          // redirect variant) so it stops waiting on a key that never comes.
          outcomes.credentialModes.set(name, mode);
          outcomes.credentials.set(step.id, { name, saved: false, message });
          api.onSkip();
        }}
      />
    ),
  };
}

import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { ChatInteractionCard } from "@houston-ai/chat";
import { type ReactNode, useCallback, useMemo } from "react";
import { approvalsFromAnswers } from "../lib/interaction-approvals";
import { interactionDraftKey } from "../stores/interaction-drafts";
import {
  hasQuestionStep,
  interactionReplyMessage,
} from "./chat-interaction-reply";
import { interactionStepCards } from "./chat-interaction-step-cards";
import {
  type ChatInteractionStepsArgs,
  mapInteractionSteps,
} from "./chat-interaction-steps";
import { useParkedInteractionCard } from "./use-parked-interaction-card";

interface ChatInteractionStepperProps extends ChatInteractionStepsArgs {
  /** Identity of THIS pending interaction ({@link interactionDraftKey}). */
  identity: string;
}

/**
 * The in-chat interaction card, wired to this conversation's parked state.
 *
 * Everything that must live exactly as long as ONE walked sequence is owned by
 * this keyed instance: the outcome log the step cards write into (see
 * {@link useParkedInteractionCard}), the mapped steps, and the completion
 * callback. The panel's composer-override memo has many dependencies and re-runs
 * while the user walks — a log minted there would be replaced mid-walk without
 * remounting this card, and the next keystroke would park the empty replacement
 * over the real one.
 */
export function ChatInteractionStepper({
  identity,
  ...args
}: ChatInteractionStepperProps) {
  const {
    steps,
    agentId,
    conversationId: sessionKey,
    accountScope,
    labels,
    approvalCopy,
    resolveBrand,
    resolveProviderName,
    onDismiss,
    onSend,
    t,
  } = args;
  const { outcomes, state, onStateChange, isLive } = useParkedInteractionCard({
    sessionKey,
    identity,
    steps,
  });

  const mapped = useMemo(
    () =>
      mapInteractionSteps({
        steps,
        approvalCopy,
        resolveBrand,
        resolveProviderName,
        t,
      }),
    [steps, approvalCopy, resolveBrand, resolveProviderName, t],
  );
  const cards = useMemo(
    () =>
      interactionStepCards({
        steps,
        agentId,
        conversationId: sessionKey,
        accountScope,
        outcomes,
      }),
    [steps, agentId, sessionKey, accountScope, outcomes],
  );
  const onComplete = useCallback(
    (answers: ChatInteractionAnswer[]) => {
      // A connect flow that outlived this card advances the instance it was
      // started from, which can complete the sequence all over again. That
      // reply belongs to a card the user already left: it would send answers
      // they are still editing on the card in front of them. The returning
      // card's connect step self-reports an already-connected toolkit on mount,
      // so nothing is lost by dropping this.
      if (!isLive()) return;
      onSend(
        interactionReplyMessage({
          steps,
          answers,
          outcomes,
          hasQuestionSteps: hasQuestionStep(mapped),
          t,
        }),
        undefined,
        approvalsFromAnswers(mapped, answers),
      );
    },
    [isLive, mapped, onSend, outcomes, steps, t],
  );

  return (
    <ChatInteractionCard
      {...cards}
      labels={labels}
      onComplete={onComplete}
      onDismiss={onDismiss}
      onStateChange={onStateChange}
      state={state}
      steps={mapped}
    />
  );
}

/**
 * The composer-replacing interaction stepper, built for ONE pending
 * interaction.
 *
 * A builder rather than an element the panel writes itself, only so the `key`
 * travels with the component it keys: React reuses an instance whose position
 * and type match, so switching straight from one mission's pending card to
 * another's would otherwise keep the first card's answers alive inside the
 * second. Conversation + interaction is what makes the two different instances.
 */
export function chatInteractionStepsNode(
  args: ChatInteractionStepsArgs,
): ReactNode {
  // The identity is built from the WIRE steps, so it names the interaction the
  // agent asked for rather than this surface's localized rendering of it.
  const identity = interactionDraftKey(args.steps);
  return (
    <ChatInteractionStepper
      key={`${args.conversationId ?? ""}:${identity}`}
      {...args}
      identity={identity}
    />
  );
}

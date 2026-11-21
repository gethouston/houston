import type { ChatInteractionAnswer } from "@houston-ai/chat";
import { ChatInteractionCard } from "@houston-ai/chat";
import { type ReactNode, useCallback, useMemo } from "react";
import { approvalsFromAnswers } from "../lib/interaction-approvals";
import { interactionCompletionKey } from "../lib/interaction-completion-key";
import { useAgentStore } from "../stores/agents";
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
  identity: string;
}

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

  const agents = useAgentStore((s) => s.agents);
  const mapped = useMemo(
    () =>
      mapInteractionSteps({
        steps,
        approvalCopy,
        resolveBrand,
        resolveProviderName,
        resolveAgentName: (id) => agents.find((a) => a.id === id)?.name,
        t,
      }),
    [steps, approvalCopy, resolveBrand, resolveProviderName, agents, t],
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
    (answers: ChatInteractionAnswer[], files: File[]) => {
      if (!isLive()) return Promise.resolve(false);
      return onSend(
        interactionReplyMessage({
          steps,
          answers,
          outcomes,
          hasQuestionSteps: hasQuestionStep(mapped),
          t,
        }),
        undefined,
        approvalsFromAnswers(mapped, answers),
        files,
      );
    },
    [isLive, mapped, onSend, outcomes, steps, t],
  );

  return (
    <ChatInteractionCard
      {...cards}
      completionKey={interactionCompletionKey(agentId, sessionKey, identity)}
      labels={labels}
      onComplete={onComplete}
      onDismiss={onDismiss}
      onStateChange={onStateChange}
      state={state}
      steps={mapped}
    />
  );
}

export function chatInteractionStepsNode(
  args: ChatInteractionStepsArgs,
): ReactNode {
  const identity = interactionDraftKey(args.steps);
  return (
    <ChatInteractionStepper
      key={`${args.conversationId ?? ""}:${identity}`}
      {...args}
      identity={identity}
    />
  );
}

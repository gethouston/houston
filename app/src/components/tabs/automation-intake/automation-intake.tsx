import {
  type ChatInteractionAnswer,
  ChatInteractionCard,
  type ChatInteractionStep,
  type StepChrome,
} from "@houston-ai/chat";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  forkDestination,
  type IntakePhase,
  pickedOptionId,
  type StartChoice,
  type WakeChoice,
  wakeDestination,
} from "./intake-machine";
import { IntakeTemplateCard } from "./intake-template-card";
import { IntakeTriggerCard } from "./intake-trigger-card";
import { IntakeWebhookCard } from "./intake-webhook-card";
import type { AutomationIntakeProps } from "./types";
import { useIntakeCardLabels } from "./use-intake-card-labels";
import { useIntakeQuestions } from "./use-intake-questions";

const noRender = () => null;

/**
 * The scripted intake that opens the moment the user starts a new scheduled
 * task, floating ABOVE the always-mounted chat composer (the caller keeps the
 * composer mounted; typing in it is the escape hatch). It runs a phased sequence
 * of cards that look exactly like the agent's real ask_user cards — the SAME
 * {@link ChatInteractionCard}/InteractionModal shell — but locally driven with
 * zero model calls:
 *
 *   fork ("How do you want to start?")
 *     ├─ "From scratch" → wake question → the matching step: a text schedule
 *     │    question (idea options + a free-text row), or the app-pick / webhook
 *     │    re-hosted detail cards
 *     └─ "Start from a template" → the template picker
 *
 * Skipping the fork, wake, or schedule question completes with `{ intent: null,
 * wake: null, scheduleHint: null }` (the AI interviews from scratch); the modal X
 * calls `onDismiss` (back to the list, nothing created). Completing hands the
 * collected result to `onComplete`, after which the real model-backed chat takes
 * over the same view.
 */
export function AutomationIntake({
  agent,
  accountTimezone,
  triggersAvailable,
  onComplete,
  onDismiss,
}: AutomationIntakeProps): ReactNode {
  const { t } = useTranslation("routines");
  const [phase, setPhase] = useState<IntakePhase>("fork");
  const options = useIntakeQuestions();
  const labels = useIntakeCardLabels();

  const aiLed = () =>
    onComplete({ intent: null, wake: null, scheduleHint: null });

  const onQuestionComplete = (answers: ChatInteractionAnswer[]) => {
    if (phase === "fork") {
      const dest = forkDestination(
        pickedOptionId(options.fork, answers) as StartChoice | null,
        triggersAvailable,
      );
      if (dest === "aiLed") aiLed();
      else setPhase(dest);
    } else if (phase === "wake") {
      const dest = wakeDestination(
        pickedOptionId(options.wake, answers) as WakeChoice | null,
      );
      if (dest === "aiLed") aiLed();
      else setPhase(dest);
    } else if (phase === "schedule") {
      // The picked-option label or typed cadence IS the hint; skipping goes AI-led.
      const hint = answers[0]?.answer.trim();
      if (hint) onComplete({ intent: null, wake: null, scheduleHint: hint });
      else aiLed();
    }
  };

  // Short fallback title for a re-hosted detail step (the card owns the real
  // modal title; this only fills the custom step's `title` slot).
  const detailTitle =
    phase === "trigger"
      ? t("triggerStep.title")
      : phase === "webhook"
        ? t("wizard.webhookTitle")
        : t("intake.templatePickTitle");

  const isQuestion =
    phase === "fork" || phase === "wake" || phase === "schedule";
  const questionTitle =
    phase === "fork"
      ? t("intake.startTitle")
      : phase === "wake"
        ? t("wizard.wakeTitle")
        : t("intake.scheduleTitle");
  const questionOptions =
    phase === "fork"
      ? options.fork
      : phase === "wake"
        ? options.wake
        : options.schedule;
  const steps: ChatInteractionStep[] = isQuestion
    ? [
        {
          kind: "question",
          id: phase,
          question: questionTitle,
          options: questionOptions,
          // The schedule step keeps the free-text row (typing a cadence is the
          // point); fork and wake are option-only.
          hideFreeText: phase !== "schedule",
        },
      ]
    : [{ kind: "custom", id: phase, title: detailTitle }];

  const detailWake = (
    pick: NonNullable<Parameters<typeof onComplete>[0]["wake"]>,
  ) => onComplete({ intent: null, wake: pick, scheduleHint: null });

  const renderDetail = (chrome: StepChrome): ReactNode => {
    switch (phase) {
      case "trigger":
        return (
          <IntakeTriggerCard
            agent={agent}
            chrome={chrome}
            onBack={() => setPhase("wake")}
            onComplete={detailWake}
          />
        );
      case "webhook":
        return (
          <IntakeWebhookCard
            chrome={chrome}
            onBack={() => setPhase("wake")}
            onComplete={detailWake}
          />
        );
      case "template":
        return (
          <IntakeTemplateCard
            accountTimezone={accountTimezone}
            chrome={chrome}
            onBack={() => setPhase("fork")}
            onComplete={onComplete}
            triggersAvailable={triggersAvailable}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ChatInteractionCard
      key={phase}
      labels={labels}
      onComplete={onQuestionComplete}
      onDismiss={onDismiss}
      renderConnect={noRender}
      renderCredential={noRender}
      renderCustom={(_step, api) => renderDetail(api)}
      renderSignin={noRender}
      steps={steps}
    />
  );
}

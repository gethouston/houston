import type {
  ChatInteractionAnswer,
  ChatInteractionStep,
} from "@houston-ai/chat";
import type { useTranslation } from "react-i18next";
import { encodeInteractionAnswersMessage } from "../lib/interaction-answers-marker.ts";
import {
  type ConnectOutcome,
  type CredentialOutcome,
  finalConnectNames,
  finalCredentialNames,
  finalHandsOnNames,
  type HandsOnOutcome,
} from "../lib/interaction-outcomes.ts";
import type { NonPlanReadyStep } from "../lib/plan-ready";

export type InteractionT = ReturnType<typeof useTranslation>["t"];

export interface InteractionOutcomes {
  readonly connects: Map<string, ConnectOutcome>;
  readonly credentials: Map<string, CredentialOutcome>;
  readonly handsOn: Map<string, HandsOnOutcome>;
  readonly credentialModes: Map<string, "key" | "oauth">;
  signin: "pending" | "signedIn" | "skipped";
  signinDeclineText: string | undefined;
}

export function createInteractionOutcomes(): InteractionOutcomes {
  return {
    connects: new Map(),
    credentials: new Map(),
    handsOn: new Map(),
    credentialModes: new Map(),
    signin: "pending",
    signinDeclineText: undefined,
  };
}

export function interactionReplyMessage(args: {
  steps: readonly NonPlanReadyStep[];
  answers: ChatInteractionAnswer[];
  outcomes: InteractionOutcomes;
  hasQuestionSteps: boolean;
  t: InteractionT;
}): string {
  const { steps, answers, outcomes, hasQuestionSteps, t } = args;
  const { connectedNames, skippedConnectNames, connectRedirects } =
    finalConnectNames(
      steps
        .filter((s) => s.kind === "connect" || s.kind === "provider_connect")
        .map((s) => s.id),
      outcomes.connects,
    );
  const { credentialedNames, skippedCredentialNames, credentialRedirects } =
    finalCredentialNames(
      steps.filter((s) => s.kind === "credential").map((s) => s.id),
      outcomes.credentials,
    );
  const { finishedScreens, skippedScreens, handsOnRedirects } =
    finalHandsOnNames(
      steps.filter((s) => s.kind === "hands_on").map((s) => s.id),
      outcomes.handsOn,
    );
  const oauth = (name: string) =>
    outcomes.credentialModes.get(name) === "oauth";
  return encodeInteractionAnswersMessage({
    answers,
    connectedNames,
    skippedConnectNames,
    credentialedNames,
    skippedCredentialNames,
    finishedScreens,
    skippedScreens,
    handsOnRedirects,
    connectRedirects,
    credentialRedirects,
    signinDeclineText: outcomes.signinDeclineText,
    hasQuestionSteps,
    signedIn: outcomes.signin === "signedIn",
    signinSkipped: outcomes.signin === "skipped",
    connectedLine: (name) => t("chat:interaction.connectedLine", { name }),
    skippedConnectLine: (name) =>
      t("chat:interaction.skippedConnectLine", { name }),
    connectRedirectLine: (name, text) =>
      t("chat:interaction.connectRedirectLine", { name, text }),
    credentialedLine: (name) =>
      t(
        oauth(name)
          ? "chat:credential.signedInLine"
          : "chat:credential.savedLine",
        {
          name,
        },
      ),
    skippedCredentialLine: (name) =>
      t(
        oauth(name)
          ? "chat:credential.skippedSignInLine"
          : "chat:credential.skippedLine",
        { name },
      ),
    credentialRedirectLine: (name, text) =>
      t(
        oauth(name)
          ? "chat:credential.signInRedirectLine"
          : "chat:credential.redirectLine",
        { name, text },
      ),
    handsOnLine: (screen) => t("chat:interaction.handsOnLine", { screen }),
    handsOnSkippedLine: (screen) =>
      t("chat:interaction.handsOnSkippedLine", { screen }),
    handsOnRedirectLine: (screen, text) =>
      t("chat:interaction.handsOnRedirectLine", { screen, text }),
    signedInLine: t("chat:interaction.signedInLine"),
    skippedSigninLine: t("chat:interaction.skippedSigninLine"),
    signinRedirectLine: (text) =>
      t("chat:interaction.signinRedirectLine", { text }),
    signedInFollowup: t("chat:interaction.signedInFollowup"),
    credentialedFollowup: t(
      credentialedNames.length > 0 && credentialedNames.every(oauth)
        ? "chat:credential.signedInFollowup"
        : "chat:credential.savedFollowup",
      { name: credentialedNames.join(", ") },
    ),
  });
}

export function hasQuestionStep(
  steps: readonly ChatInteractionStep[],
): boolean {
  return steps.some((step) => step.kind === "question");
}

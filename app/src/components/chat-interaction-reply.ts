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

/** The panel's own `t`, so a key that compiles there compiles here. */
export type InteractionT = ReturnType<typeof useTranslation>["t"];

/**
 * What the user actually DID to each step, recorded in place as they walk the
 * sequence.
 *
 * A completed sequence has walked EVERY step, but a signin/connect/credential
 * step may have been SKIPPED — a fact the agent must hear, or it re-asks forever
 * — OR skipped then RECONSIDERED (walked Back and connected after all). The
 * reply must reflect FINAL state, never a stale skip line, so a later connect
 * overwrites an earlier skip for the same step.
 *
 * One log lives as long as ONE rendered sequence: the panel derives a STABLE
 * interaction reference, so its memo does not recompute — and these outcomes do
 * not reset — while the user walks the steps; a fresh interaction starts clean.
 * That is why they are plain mutable fields rather than React state: a state
 * write would re-render mid-sequence and re-mint the very card being answered.
 */
export interface InteractionOutcomes {
  /** Per connect / provider-connect step's FINAL outcome, keyed by step id. */
  readonly connects: Map<string, ConnectOutcome>;
  /** Per credential step's FINAL outcome — the credential mirror of `connects`. */
  readonly credentials: Map<string, CredentialOutcome>;
  /** Per hands-on step's FINAL outcome, keyed by step id. Nothing can observe
   *  the screen the person was sent to, so this is the ONLY evidence of what
   *  happened there. */
  readonly handsOn: Map<string, HandsOnOutcome>;
  /**
   * How each credentialed integration authenticates, keyed by NAME (the unit the
   * composed lines speak in): a sign-in (oauth) step reads "Signed in to X." /
   * "Skipped signing in to X." instead of the key wording, so the agent narrates
   * whichever fact actually happened (PRODUCT-1172).
   */
  readonly credentialModes: Map<string, "key" | "oauth">;
  /** The single signin step's FINAL state. */
  signin: "pending" | "signedIn" | "skipped";
  /**
   * The user's typed "do this instead" text on a declined sign-in step (the
   * free-text row), relayed to the agent so it hears the redirection.
   */
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

/**
 * The ONE message a completed sequence sends: the user's visible answers when it
 * carried questions, else a hidden auto-continue that resumes the agent without
 * a fake user bubble. Either way it appends the connected / signed-in / skipped
 * facts derived from each step's FINAL outcome, in step order, so no step is
 * named twice and none is reported on a stale verdict.
 */
export function interactionReplyMessage(args: {
  /** The protocol steps the stepper walked. */
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

/** The mapped steps that carry a question, for the approval receipts. */
export function hasQuestionStep(
  steps: readonly ChatInteractionStep[],
): boolean {
  return steps.some((step) => step.kind === "question");
}

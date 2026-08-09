// Which of a device's TWO copies of the survey record is right — the engine
// preference (the account's copy, on the user's pod when hosted) and the
// localStorage mirror — and what the reconciled record looks like. Pure, so
// `app/tests` drives every case; `./onboarding-survey-store.ts` is the only
// caller and owns the writes that follow.

import {
  type OnboardingSurveyPreference,
  sameSurveyAnswers,
} from "./onboarding-survey.ts";

export interface ReconciledSurvey {
  /** The copy that wins, field by field. */
  record: OnboardingSurveyPreference;
  /** Whether the ENGINE's copy differs from it and must be healed. */
  healEngine: boolean;
}

/** Every field, not just the answers — the equality that decides whether the
 *  engine still needs writing. */
function sameRecord(
  a: OnboardingSurveyPreference,
  b: OnboardingSurveyPreference,
): boolean {
  return (
    sameSurveyAnswers(a, b) &&
    a.completionPromptDismissed === b.completionPromptDismissed &&
    a.updatedAt === b.updatedAt &&
    a.gatewaySyncedAt === b.gatewaySyncedAt
  );
}

/**
 * `updatedAt` moves with the ANSWERS only: dismissing the completion prompt and
 * stamping a gateway push both hold it deliberately (`reviseLocalState` /
 * `markGatewaySynced`). So two copies sharing a stamp can still differ, and a
 * tie has to be resolved field by field rather than handed to either side
 * wholesale.
 *
 * ANSWERS on a tie: the ENGINE's stand. They are the account's copy, and the
 * mirror cannot prove it is ahead — `mergeGatewayOnboarding` writes new answers
 * into a record while HOLDING `updatedAt`, so a stale mirror that merely
 * carries a sync stamp would otherwise delete an answer this device merged in
 * from another one. The stamp goes to null with them: a stamp describes the
 * answers it was written for, and once those are not the answers we keep, it
 * would only suppress the catch-up flush that repairs the gateway.
 *
 * The stamp SURVIVES a tie whose answers agree (from whichever side has one) —
 * losing it costs a needless, idempotent catch-up PUT.
 */
function resolveTie(
  mirror: OnboardingSurveyPreference,
  engine: OnboardingSurveyPreference,
  completionPromptDismissed: boolean,
): OnboardingSurveyPreference {
  if (!sameSurveyAnswers(mirror, engine))
    return { ...engine, completionPromptDismissed, gatewaySyncedAt: null };
  return {
    ...engine,
    completionPromptDismissed,
    gatewaySyncedAt: engine.gatewaySyncedAt ?? mirror.gatewaySyncedAt,
  };
}

/**
 * Reconcile the two copies. The newer set of ANSWERS wins outright, and a tie
 * is resolved by {@link resolveTie}; the dismissal is folded in either way,
 * because it is MONOTONE (nothing ever un-dismisses the prompt) and losing one
 * is what brought the completion prompt back on every single launch.
 *
 * An unparseable `updatedAt` is not an ordering — the strict parser rejects one
 * long before this, but if either side ever carries it, the tie rules apply and
 * the account's copy stands rather than being overwritten on a guess.
 */
export function reconcileSurveyCopies(
  mirror: OnboardingSurveyPreference,
  engine: OnboardingSurveyPreference,
): ReconciledSurvey {
  const completionPromptDismissed =
    mirror.completionPromptDismissed || engine.completionPromptDismissed;
  const mirrorAt = Date.parse(mirror.updatedAt);
  const engineAt = Date.parse(engine.updatedAt);
  const ordered =
    !Number.isNaN(mirrorAt) && !Number.isNaN(engineAt) && mirrorAt !== engineAt;
  const record = ordered
    ? {
        ...(mirrorAt > engineAt ? mirror : engine),
        completionPromptDismissed,
      }
    : resolveTie(mirror, engine, completionPromptDismissed);
  return { record, healEngine: !sameRecord(record, engine) };
}

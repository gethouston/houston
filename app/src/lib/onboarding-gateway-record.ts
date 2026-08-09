// The onboarding survey as the GATEWAY stores it, and the rules for folding
// that copy into the device's preference record. Pure — no transport, no
// window — so `app/tests` drives it directly; the HTTP client that speaks this
// shape (and the front door consumers import) is `./onboarding-sync.ts`.

import {
  createOnboardingSurveyPreference,
  isOnboardingIndustryChoice,
  isOnboardingSegmentChoice,
  isValidAutomationGoal,
  type OnboardingIndustryChoice,
  type OnboardingSegmentChoice,
  type OnboardingSurveyPreference,
  sameSurveyAnswers,
} from "./onboarding-survey.ts";

/** The gateway's answer shape. Ids are plain strings on the wire: a value this
 *  build doesn't know (an id added by a newer app) must not poison the read. */
export interface GatewayOnboardingRecord {
  segment: string | null;
  industry: string | null;
  automationGoal: string | null;
  goalSkipped: boolean;
  segmentAnsweredAt: string | null;
  industryAnsweredAt: string | null;
  goalAnsweredAt: string | null;
}

/** A PUT body: any non-empty subset of the four answer fields. */
export interface OnboardingSyncPatch {
  segment?: OnboardingSegmentChoice;
  industry?: OnboardingIndustryChoice;
  automationGoal?: string;
  goalSkipped?: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Field-by-field, so one unrecognized id costs only that field. */
export function parseGatewayOnboarding(
  value: unknown,
): GatewayOnboardingRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  return {
    segment: isOnboardingSegmentChoice(raw.segment) ? raw.segment : null,
    industry: isOnboardingIndustryChoice(raw.industry) ? raw.industry : null,
    automationGoal: isValidAutomationGoal(raw.automationGoal)
      ? raw.automationGoal.trim()
      : null,
    goalSkipped: raw.goalSkipped === true,
    segmentAnsweredAt: asString(raw.segmentAnsweredAt),
    industryAnsweredAt: asString(raw.industryAnsweredAt),
    goalAnsweredAt: asString(raw.goalAnsweredAt),
  };
}

/** Drops anything the gateway would answer 400 to. An invalid value is a
 *  caller bug, reported to `onInvalid` rather than thrown: a sync is a mirror
 *  and must never break the answer the user just saved. */
export function sanitizeOnboardingPatch(
  patch: OnboardingSyncPatch,
  onInvalid: (reason: string) => void,
): OnboardingSyncPatch | null {
  const body: OnboardingSyncPatch = {};
  if (patch.segment !== undefined) {
    if (isOnboardingSegmentChoice(patch.segment)) body.segment = patch.segment;
    else onInvalid(`dropped unknown segment "${patch.segment}"`);
  }
  if (patch.industry !== undefined) {
    if (isOnboardingIndustryChoice(patch.industry))
      body.industry = patch.industry;
    else onInvalid(`dropped unknown industry "${patch.industry}"`);
  }
  if (patch.automationGoal !== undefined) {
    if (isValidAutomationGoal(patch.automationGoal))
      body.automationGoal = patch.automationGoal.trim();
    else onInvalid("dropped out-of-range automation goal");
  }
  if (patch.goalSkipped !== undefined) body.goalSkipped = patch.goalSkipped;
  return Object.keys(body).length > 0 ? body : null;
}

/** The newest `*_answered_at` the gateway reports, for a record adopted whole. */
function latestAnswerAt(remote: GatewayOnboardingRecord): string | null {
  const stamps = [
    remote.segmentAnsweredAt,
    remote.industryAnsweredAt,
    remote.goalAnsweredAt,
  ].filter((s): s is string => s !== null && !Number.isNaN(Date.parse(s)));
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

/**
 * Fold the gateway's copy into the local record, filling ONLY the questions
 * this device has no answer for (answered on another device, or backfilled
 * server-side). Local answers always win — the user is looking at them.
 * Returns null when nothing changes, so an unchanged record is never rewritten.
 *
 * Sync state is deliberately left alone: a record that already existed keeps
 * its `gatewaySyncedAt` (null ⇒ the catch-up flush still pushes, which is
 * idempotent), and a record built purely FROM the gateway starts stamped,
 * because nothing in it is ahead of the server.
 */
export function mergeGatewayOnboarding(
  local: OnboardingSurveyPreference | null,
  remote: GatewayOnboardingRecord | null,
): OnboardingSurveyPreference | null {
  if (!remote) return null;
  const base = local ?? createOnboardingSurveyPreference();
  // Conscious: the latest LOCAL goal action wins over the remote row (offline
  // text beats a remote skip; a local skip's later flush beats remote text).
  const goalAnsweredLocally = base.automationGoal !== null || base.goalSkipped;
  // A remote row holding BOTH text and the skip flag is a retraction the store
  // recorded incompletely (an older gateway, or a row written before the
  // server enforced exclusivity). The skip wins: resurrecting text the user
  // took back would put words in their mouth.
  const remoteGoal = remote.goalSkipped ? null : remote.automationGoal;
  const merged: OnboardingSurveyPreference = {
    ...base,
    segment:
      base.segment ??
      (isOnboardingSegmentChoice(remote.segment) ? remote.segment : null),
    industry:
      base.industry ??
      (isOnboardingIndustryChoice(remote.industry) ? remote.industry : null),
    automationGoal: goalAnsweredLocally ? base.automationGoal : remoteGoal,
    goalSkipped: goalAnsweredLocally ? base.goalSkipped : remote.goalSkipped,
    updatedAt: local
      ? local.updatedAt
      : (latestAnswerAt(remote) ?? base.updatedAt),
    gatewaySyncedAt: local ? local.gatewaySyncedAt : new Date().toISOString(),
  };
  // No local record AND an empty gateway record: don't mint an empty survey.
  const before = local ?? createOnboardingSurveyPreference();
  return sameSurveyAnswers(before, merged) ? null : merged;
}

/**
 * Every answer the local record holds, as a PUT body — the payload of the
 * catch-up flush for a record whose write never reached the gateway.
 *
 * The goal question contributes exactly ONE field, never both: the server owns
 * the exclusivity invariant (text ⇒ `goal_skipped=false`, skip ⇒ the text is
 * nulled), so sending text and the skip flag together would only fight it.
 */
export function onboardingPatchFromSurvey(
  preference: OnboardingSurveyPreference,
): OnboardingSyncPatch | null {
  const patch: OnboardingSyncPatch = {};
  if (preference.segment !== null) patch.segment = preference.segment;
  if (preference.industry !== null) patch.industry = preference.industry;
  if (preference.automationGoal !== null)
    patch.automationGoal = preference.automationGoal;
  else if (preference.goalSkipped) patch.goalSkipped = true;
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The catch-up flush's decision: whether this mount still owes the gateway a
 * push. A record whose push never landed (offline, pod waking, signed out at
 * the time) is re-sent ONCE per account, so the account store converges without
 * the user answering anything again. WHAT gets sent is not decided here — the
 * flush derives it from the record it is about to stamp, so payload and stamp
 * can never disagree.
 *
 * The "once" is keyed by uid, not by a bare boolean: two accounts can sign in
 * on one machine within a single app session, and the second one's unsynced
 * record must still get its catch-up. `undefined` means nothing has flushed
 * yet — distinct from `null`, which is the signed-out account slot.
 *
 * A record a SAVE is already pushing is owed nothing: without `pendingFlush`
 * the session's first save duplicates its own PUT (it writes the unsynced
 * record to the cache, then flushes it) and burns the latch on nothing.
 */
export function owesGatewayCatchUp(input: {
  survey: OnboardingSurveyPreference | null;
  uid: string | null;
  flushedUid: string | null | undefined;
  /** `updatedAt` of the record whose flush a save already owns, else null. */
  pendingFlush: string | null;
}): boolean {
  const { survey, uid, flushedUid, pendingFlush } = input;
  if (flushedUid !== undefined && flushedUid === uid) return false;
  if (!survey || survey.gatewaySyncedAt !== null) return false;
  if (pendingFlush !== null && pendingFlush === survey.updatedAt) return false;
  return onboardingPatchFromSurvey(survey) !== null;
}

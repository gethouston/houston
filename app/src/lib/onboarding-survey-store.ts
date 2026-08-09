// Where the onboarding survey LIVES on a device: the account preference the
// engine holds, its uid-scoped localStorage mirror, and the one-time lift of
// the pre-survey segment preference. Split from `hooks/use-onboarding-survey`
// so the hook stays React-only — this module is the persistence layer.
//
// Every device-touching call goes through {@link SurveyStorePorts}, injected by
// the caller (`./onboarding-survey-ports.ts` wires the live ones), so the
// durability rules below are driven directly by `app/tests` with no engine, no
// browser storage and no network.

import {
  ONBOARDING_SEGMENT_PREF_KEY,
  type OnboardingSegmentPreference,
  onboardingSegmentLocalKey,
  parseOnboardingSegmentPreference,
} from "./onboarding-segment.ts";
import {
  liftLegacySegmentPreference,
  ONBOARDING_SURVEY_PREF_KEY,
  type OnboardingSurveyPreference,
  onboardingSurveyLocalKey,
  parseOnboardingSurveyPreference,
  serializeOnboardingSurveyPreference,
} from "./onboarding-survey.ts";
import { reconcileSurveyCopies } from "./onboarding-survey-reconcile.ts";
import {
  type GatewayOnboardingRecord,
  mergeGatewayOnboarding,
} from "./onboarding-sync.ts";

/** The three places the survey can live, as ports. */
export interface SurveyStorePorts {
  /** The ACCOUNT preference store — the engine (the user's pod, when hosted). */
  getPreference: (key: string) => Promise<string | null>;
  setPreference: (key: string, value: string) => Promise<void>;
  /** The device mirror. */
  readLocal: (key: string) => string | null;
  writeLocal: (key: string, value: string) => void;
  /** The account's copy at the gateway. */
  fetchGateway: () => Promise<GatewayOnboardingRecord | null>;
}

// Device-local mirror of the answers (per signed-in uid), same reasoning as the
// segment mirror it replaces: the engine preference lives on the user's pod in
// hosted mode, so a pod blip must never re-ask an answered question.
function writeMirror(
  ports: SurveyStorePorts,
  uid: string | null,
  serialized: string,
): void {
  ports.writeLocal(onboardingSurveyLocalKey(uid), serialized);
}

function readMirror(
  ports: SurveyStorePorts,
  uid: string | null,
): OnboardingSurveyPreference | null {
  return parseOnboardingSurveyPreference(
    ports.readLocal(onboardingSurveyLocalKey(uid)),
  );
}

/**
 * The mirror is written FIRST and the engine write may fail WITHOUT blocking or
 * throwing. That is deliberate, and it is the legacy segment pattern: the
 * engine preference lives on the user's pod in hosted mode, so a pod blip would
 * otherwise either stall the answer the user just gave or bounce them back into
 * a question they already answered. The durability that trade-off costs is
 * bought back on the next load by {@link readSurveyPreference}'s self-heal.
 */
export async function persistSurveyPreference(
  uid: string | null,
  preference: OnboardingSurveyPreference,
  ports: SurveyStorePorts,
): Promise<void> {
  const serialized = serializeOnboardingSurveyPreference(preference);
  writeMirror(ports, uid, serialized);
  try {
    await ports.setPreference(ONBOARDING_SURVEY_PREF_KEY, serialized);
  } catch (e) {
    console.error("[onboarding-survey] engine pref write failed", e);
  }
}

/**
 * The pre-survey answer, from the engine preference or from the device mirror
 * the old segment hook wrote FIRST. Both are consulted: an answer whose engine
 * write failed (warming pod) survived only in that mirror, and dropping it here
 * would re-ask the one question those users already answered.
 */
async function readLegacySegment(
  ports: SurveyStorePorts,
  uid: string | null,
): Promise<OnboardingSegmentPreference | null> {
  let raw: string | null = null;
  try {
    raw = await ports.getPreference(ONBOARDING_SEGMENT_PREF_KEY);
  } catch {
    // Engine unreachable (hosted pod waking) — the legacy mirror answers.
  }
  const fromEngine = parseOnboardingSegmentPreference(raw);
  if (fromEngine) return fromEngine;
  return parseOnboardingSegmentPreference(
    ports.readLocal(onboardingSegmentLocalKey(uid)),
  );
}

/**
 * Engine preference, else the device mirror, else the pre-survey segment
 * preference lifted into a v2 record (the legacy key stays put for rollback).
 * Two copies that both parse are reconciled field by field
 * ({@link reconcileSurveyCopies}) — neither side is trusted wholesale.
 *
 * SELF-HEAL: whenever the reconciled record is not what the engine holds (it
 * has nothing, something unparseable, or an older/poorer copy) it is re-pushed
 * there, once per load and without blocking the read. That is what closes the
 * durability gap left by the non-blocking write in
 * {@link persistSurveyPreference}.
 */
async function readSurveyPreference(
  ports: SurveyStorePorts,
  uid: string | null,
): Promise<OnboardingSurveyPreference | null> {
  let raw: string | null = null;
  try {
    raw = await ports.getPreference(ONBOARDING_SURVEY_PREF_KEY);
  } catch {
    // Engine unreachable (hosted pod waking) — the mirror answers instead.
  }
  const fromEngine = parseOnboardingSurveyPreference(raw);
  const mirrored = readMirror(ports, uid);
  if (fromEngine && mirrored) {
    const { record, healEngine } = reconcileSurveyCopies(mirrored, fromEngine);
    if (healEngine) void persistSurveyPreference(uid, record, ports);
    else writeMirror(ports, uid, serializeOnboardingSurveyPreference(record));
    return record;
  }
  if (fromEngine) {
    if (raw) writeMirror(ports, uid, raw);
    return fromEngine;
  }
  if (mirrored) {
    void persistSurveyPreference(uid, mirrored, ports);
    return mirrored;
  }
  const lifted = liftLegacySegmentPreference(
    await readLegacySegment(ports, uid),
  );
  if (lifted) await persistSurveyPreference(uid, lifted, ports);
  return lifted;
}

/**
 * The device's record, with anything the account store knows and this device
 * doesn't folded in (answered on another device, or backfilled server-side).
 * The merged record is written back so the fold happens once.
 */
export async function loadSurveyPreference(
  uid: string | null,
  gateway: boolean,
  ports: SurveyStorePorts,
): Promise<OnboardingSurveyPreference | null> {
  const local = await readSurveyPreference(ports, uid);
  if (!gateway) return local;
  const merged = mergeGatewayOnboarding(local, await ports.fetchGateway());
  if (!merged) return local;
  await persistSurveyPreference(uid, merged, ports);
  return merged;
}

import {
  type LegacySegmentPreference,
  liftLegacySegmentPreference,
  ONBOARDING_SEGMENT_PREF_KEY,
  onboardingSegmentLocalKey,
  parseLegacySegmentPreference,
} from "./onboarding-legacy-segment.ts";
import {
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

export interface SurveyStorePorts {
  getPreference: (key: string) => Promise<string | null>;
  setPreference: (key: string, value: string) => Promise<void>;
  readLocal: (key: string) => string | null;
  writeLocal: (key: string, value: string) => void;
  fetchGateway: () => Promise<GatewayOnboardingRecord | null>;
}

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

async function readLegacySegment(
  ports: SurveyStorePorts,
  uid: string | null,
): Promise<LegacySegmentPreference | null> {
  let raw: string | null = null;
  try {
    raw = await ports.getPreference(ONBOARDING_SEGMENT_PREF_KEY);
  } catch {}
  const fromEngine = parseLegacySegmentPreference(raw);
  if (fromEngine) return fromEngine;
  return parseLegacySegmentPreference(
    ports.readLocal(onboardingSegmentLocalKey(uid)),
  );
}

async function readSurveyPreference(
  ports: SurveyStorePorts,
  uid: string | null,
): Promise<OnboardingSurveyPreference | null> {
  let raw: string | null = null;
  try {
    raw = await ports.getPreference(ONBOARDING_SURVEY_PREF_KEY);
  } catch {}
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

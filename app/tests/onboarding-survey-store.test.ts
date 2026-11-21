import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  applyCompletionDismissed,
  applyRole,
  createOnboardingSurveyPreference,
  markGatewaySynced,
  ONBOARDING_SURVEY_PREF_KEY,
  type OnboardingSurveyPreference,
  onboardingSurveyLocalKey,
  serializeOnboardingSurveyPreference,
} from "../src/lib/onboarding-survey.ts";
import { reconcileSurveyCopies } from "../src/lib/onboarding-survey-reconcile.ts";
import {
  loadSurveyPreference,
  persistSurveyPreference,
  type SurveyStorePorts,
} from "../src/lib/onboarding-survey-store.ts";

console.error = () => {};

const UID = "uid-1";
const MIRROR_KEY = onboardingSurveyLocalKey(UID);

interface Harness {
  ports: SurveyStorePorts;
  engine: Map<string, string>;
  local: Map<string, string>;
  writes: string[];
  setEngineWrites: (ok: boolean) => void;
}

function harness(opts?: {
  failEngineWrite?: boolean;
  gateway?: SurveyStorePorts["fetchGateway"];
}): Harness {
  const engine = new Map<string, string>();
  const local = new Map<string, string>();
  const writes: string[] = [];
  let failEngineWrite = opts?.failEngineWrite ?? false;
  return {
    engine,
    local,
    writes,
    setEngineWrites: (ok: boolean) => {
      failEngineWrite = !ok;
    },
    ports: {
      getPreference: async (key) => engine.get(key) ?? null,
      setPreference: async (key, value) => {
        writes.push(key);
        if (failEngineWrite) throw new Error("pod is still waking");
        engine.set(key, value);
      },
      readLocal: (key) => local.get(key) ?? null,
      writeLocal: (key, value) => {
        local.set(key, value);
      },
      fetchGateway: opts?.gateway ?? (async () => null),
    },
  };
}

const record = (
  patch: Partial<OnboardingSurveyPreference> = {},
): OnboardingSurveyPreference => ({
  ...createOnboardingSurveyPreference(),
  role: "paralegal",
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

describe("onboarding survey store durability", () => {
  it("keeps the answer on the device when the engine write fails", async () => {
    const h = harness({ failEngineWrite: true });
    await persistSurveyPreference(UID, record(), h.ports);
    strictEqual(h.engine.size, 0);
    strictEqual(
      h.local.get(MIRROR_KEY),
      serializeOnboardingSurveyPreference(record()),
    );
  });

  it("re-persists the mirror to an engine that lost the record", async () => {
    const h = harness();
    h.local.set(MIRROR_KEY, serializeOnboardingSurveyPreference(record()));

    const loaded = await loadSurveyPreference(UID, false, h.ports);
    deepStrictEqual(loaded, record());
    deepStrictEqual(h.writes, [ONBOARDING_SURVEY_PREF_KEY]);
    strictEqual(
      h.engine.get(ONBOARDING_SURVEY_PREF_KEY),
      serializeOnboardingSurveyPreference(record()),
    );
  });

  it("heals an engine copy that is unparseable or stale", async () => {
    const corrupt = harness();
    corrupt.engine.set(ONBOARDING_SURVEY_PREF_KEY, "{not our record");
    corrupt.local.set(
      MIRROR_KEY,
      serializeOnboardingSurveyPreference(record()),
    );
    deepStrictEqual(
      await loadSurveyPreference(UID, false, corrupt.ports),
      record(),
    );
    deepStrictEqual(corrupt.writes, [ONBOARDING_SURVEY_PREF_KEY]);

    const stale = harness();
    const newer = record({
      industry: "healthcare",
      updatedAt: "2026-08-02T10:00:00.000Z",
    });
    stale.engine.set(
      ONBOARDING_SURVEY_PREF_KEY,
      serializeOnboardingSurveyPreference(record()),
    );
    stale.local.set(MIRROR_KEY, serializeOnboardingSurveyPreference(newer));
    deepStrictEqual(await loadSurveyPreference(UID, false, stale.ports), newer);
    deepStrictEqual(stale.writes, [ONBOARDING_SURVEY_PREF_KEY]);
  });

  it("leaves an engine copy that is current alone", async () => {
    const h = harness();
    h.engine.set(
      ONBOARDING_SURVEY_PREF_KEY,
      serializeOnboardingSurveyPreference(record()),
    );
    h.local.set(MIRROR_KEY, serializeOnboardingSurveyPreference(record()));
    deepStrictEqual(await loadSurveyPreference(UID, false, h.ports), record());
    deepStrictEqual(h.writes, []);
    ok(h.local.get(MIRROR_KEY));
  });

  it("has nothing to heal when neither side holds a record", async () => {
    const h = harness();
    strictEqual(await loadSurveyPreference(UID, false, h.ports), null);
    deepStrictEqual(h.writes, []);
  });
});

describe("reconciling the two copies of one record", () => {
  const at = (updatedAt: string, patch: Partial<OnboardingSurveyPreference>) =>
    record({ updatedAt, ...patch });

  it("prefers the engine's ANSWERS on a tie, and voids the stale stamp", () => {
    const mirror = at("2026-08-01T10:00:00.000Z", {
      gatewaySyncedAt: "2026-08-01T10:30:00.000Z",
      completionPromptDismissed: true,
    });
    const engine = at("2026-08-01T10:00:00.000Z", { industry: "healthcare" });

    const { record: won, healEngine } = reconcileSurveyCopies(mirror, engine);
    strictEqual(won.role, "paralegal");
    strictEqual(won.industry, "healthcare");
    strictEqual(won.gatewaySyncedAt, null);
    strictEqual(won.completionPromptDismissed, true);
    strictEqual(healEngine, true);
  });

  it("keeps the stamp on a tie whose answers agree, from either side", () => {
    const answered = at("2026-08-01T10:00:00.000Z", {});
    const stamped = markGatewaySynced(answered, "2026-08-01T11:00:00.000Z");
    strictEqual(
      reconcileSurveyCopies(stamped, answered).record.gatewaySyncedAt,
      "2026-08-01T11:00:00.000Z",
    );
    strictEqual(
      reconcileSurveyCopies(answered, stamped).record.gatewaySyncedAt,
      "2026-08-01T11:00:00.000Z",
    );
  });

  it("lets the newer answers win outright, whichever side has them", () => {
    const older = at("2026-08-01T10:00:00.000Z", {
      gatewaySyncedAt: "2026-08-01T10:30:00.000Z",
    });
    const newer = at("2026-08-02T10:00:00.000Z", { industry: "healthcare" });

    const mirrorWins = reconcileSurveyCopies(newer, older);
    strictEqual(mirrorWins.record.industry, "healthcare");
    strictEqual(mirrorWins.record.gatewaySyncedAt, null);
    strictEqual(mirrorWins.healEngine, true);

    const engineWins = reconcileSurveyCopies(older, newer);
    strictEqual(engineWins.record.industry, "healthcare");
    strictEqual(engineWins.record.updatedAt, "2026-08-02T10:00:00.000Z");
    strictEqual(engineWins.healEngine, false);
  });

  it("never loses a dismissal to a newer copy that never saw it", () => {
    const dismissed = at("2026-08-01T10:00:00.000Z", {
      completionPromptDismissed: true,
    });
    const newer = at("2026-08-02T10:00:00.000Z", { industry: "healthcare" });
    ok(
      reconcileSurveyCopies(newer, dismissed).record.completionPromptDismissed,
    );
    ok(
      reconcileSurveyCopies(dismissed, newer).record.completionPromptDismissed,
    );
  });

  it("asks for no engine write when the two copies already agree", () => {
    const both = record();
    deepStrictEqual(reconcileSurveyCopies(both, both), {
      record: both,
      healEngine: false,
    });
  });
});

describe("local state that never moves updatedAt", () => {
  it("keeps a dismissal whose engine write failed", async () => {
    const h = harness();
    const answered = applyRole(createOnboardingSurveyPreference(), "paralegal");
    await persistSurveyPreference(UID, answered, h.ports);

    h.setEngineWrites(false);
    const dismissed = applyCompletionDismissed(answered);
    strictEqual(dismissed.updatedAt, answered.updatedAt);
    strictEqual(dismissed.gatewaySyncedAt, answered.gatewaySyncedAt);
    await persistSurveyPreference(UID, dismissed, h.ports);

    h.setEngineWrites(true);
    const loaded = await loadSurveyPreference(UID, false, h.ports);
    strictEqual(loaded?.completionPromptDismissed, true);
    ok(h.local.get(MIRROR_KEY)?.includes('"completionPromptDismissed":true'));
    ok(
      h.engine
        .get(ONBOARDING_SURVEY_PREF_KEY)
        ?.includes('"completionPromptDismissed":true'),
    );
  });

  it("does not let a stale mirror stamp bury an answer merged into the engine", async () => {
    const h = harness();
    const mirror = markGatewaySynced(record(), "2026-08-01T10:30:00.000Z");
    const engine = record({ industry: "healthcare" });
    h.engine.set(
      ONBOARDING_SURVEY_PREF_KEY,
      serializeOnboardingSurveyPreference(engine),
    );
    h.local.set(MIRROR_KEY, serializeOnboardingSurveyPreference(mirror));

    const loaded = await loadSurveyPreference(UID, false, h.ports);
    strictEqual(loaded?.industry, "healthcare");
    strictEqual(loaded?.role, "paralegal");
    strictEqual(loaded?.gatewaySyncedAt, null);
    ok(h.local.get(MIRROR_KEY)?.includes('"industry":"healthcare"'));
    deepStrictEqual(h.writes, []);
  });

  it("keeps a mirror-only gateway stamp on a tie whose answers agree", async () => {
    const h = harness();
    const answered = record();
    h.engine.set(
      ONBOARDING_SURVEY_PREF_KEY,
      serializeOnboardingSurveyPreference(answered),
    );
    h.local.set(
      MIRROR_KEY,
      serializeOnboardingSurveyPreference(
        markGatewaySynced(answered, "2026-08-01T11:00:00.000Z"),
      ),
    );
    const loaded = await loadSurveyPreference(UID, false, h.ports);
    strictEqual(loaded?.gatewaySyncedAt, "2026-08-01T11:00:00.000Z");
  });

  it("still lets a current engine copy win an ordinary tie", async () => {
    const h = harness();
    const both = record({ completionPromptDismissed: true });
    h.engine.set(
      ONBOARDING_SURVEY_PREF_KEY,
      serializeOnboardingSurveyPreference(both),
    );
    h.local.set(MIRROR_KEY, serializeOnboardingSurveyPreference(both));
    deepStrictEqual(await loadSurveyPreference(UID, false, h.ports), both);
    deepStrictEqual(h.writes, []);
  });
});

describe("an account that answered before the survey existed", () => {
  it("lifts the legacy department, so the role is never asked", async () => {
    const h = harness();
    h.local.set(
      "houston.onboarding-segment.uid-1",
      JSON.stringify({
        segment: "operations",
        selectedAt: "2026-07-09T00:00:00.000Z",
        sourceScreen: "first_run_segment",
      }),
    );
    const loaded = await loadSurveyPreference(UID, false, h.ports);
    strictEqual(loaded?.segment, "operations");
    strictEqual(loaded?.role, null);
    ok(h.engine.get(ONBOARDING_SURVEY_PREF_KEY)?.includes('"operations"'));
  });

  it("keeps a stored survey record's department as it reads it", async () => {
    const h = harness();
    const {
      role: _role,
      roleOther: _other,
      ...before
    } = record({
      role: null,
      segment: "sales",
    });
    h.engine.set(ONBOARDING_SURVEY_PREF_KEY, JSON.stringify(before));
    const loaded = await loadSurveyPreference(UID, false, h.ports);
    strictEqual(loaded?.segment, "sales");
    strictEqual(loaded?.role, null);
  });
});

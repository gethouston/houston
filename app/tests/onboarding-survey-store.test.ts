import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  applyCompletionDismissed,
  applySegment,
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

// The store logs the engine-write failures it deliberately swallows.
console.error = () => {};

const UID = "uid-1";
const MIRROR_KEY = onboardingSurveyLocalKey(UID);

interface Harness {
  ports: SurveyStorePorts;
  engine: Map<string, string>;
  local: Map<string, string>;
  writes: string[];
  /** Flip the engine preference store between healthy and "pod is waking". */
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
  segment: "operations",
  updatedAt: "2026-08-01T10:00:00.000Z",
  ...patch,
});

describe("onboarding survey store durability", () => {
  it("keeps the answer on the device when the engine write fails", async () => {
    // Deliberately non-blocking (the legacy segment pattern): a pod blip must
    // not block the save or re-ask an answered question.
    const h = harness({ failEngineWrite: true });
    await persistSurveyPreference(UID, record(), h.ports);
    strictEqual(h.engine.size, 0);
    strictEqual(
      h.local.get(MIRROR_KEY),
      serializeOnboardingSurveyPreference(record()),
    );
  });

  it("re-persists the mirror to an engine that lost the record", async () => {
    // The durability half of that trade-off: the next load notices the engine
    // has nothing and pushes the device's copy back up.
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

    // A mirror strictly newer than the engine copy is an answer whose engine
    // write failed after the last successful one: it wins, and heals.
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
    // The mirror is refreshed from the engine copy either way.
    ok(h.local.get(MIRROR_KEY));
  });

  it("has nothing to heal when neither side holds a record", async () => {
    const h = harness();
    strictEqual(await loadSurveyPreference(UID, false, h.ports), null);
    deepStrictEqual(h.writes, []);
  });
});

describe("reconciling the two copies of one record", () => {
  // `updatedAt` moves with the ANSWERS only, so a tie proves nothing about the
  // rest of the record — it has to be resolved field by field.
  const at = (updatedAt: string, patch: Partial<OnboardingSurveyPreference>) =>
    record({ updatedAt, ...patch });

  it("prefers the engine's ANSWERS on a tie, and voids the stale stamp", () => {
    // TWO DEVICES. This one answered the segment and pushed it (stamped), then
    // device B answered the industry; the fold of B's answer into THIS record
    // holds `updatedAt` (`mergeGatewayOnboarding`), so the engine copy ties
    // with the mirror while holding strictly more. Handing the tie to the
    // mirror wholesale deleted the industry AND kept the stamp that suppressed
    // the catch-up: the answer was gone from this device forever.
    const mirror = at("2026-08-01T10:00:00.000Z", {
      gatewaySyncedAt: "2026-08-01T10:30:00.000Z",
      completionPromptDismissed: true,
    });
    const engine = at("2026-08-01T10:00:00.000Z", { industry: "healthcare" });

    const { record: won, healEngine } = reconcileSurveyCopies(mirror, engine);
    strictEqual(won.segment, "operations");
    strictEqual(won.industry, "healthcare");
    // The stamp described answers this record no longer matches: dropping it is
    // what lets the (whole-record) catch-up flush repair the gateway.
    strictEqual(won.gatewaySyncedAt, null);
    // …and the dismissal is monotone, so it survives the answers losing.
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
    // Monotone: nothing un-dismisses the prompt, so an OR is always right and
    // a device that dismissed it is never interrupted again.
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
    // `applyCompletionDismissed` deliberately leaves `updatedAt` (and the sync
    // stamp) alone — it is not an answer. So a dismissal the pod refused ties
    // with the engine's copy, and a strict `>` comparison handed the tie to
    // the engine AND overwrote the mirror with it: the completion prompt came
    // back on every launch, forever.
    const h = harness();
    const answered = applySegment(createOnboardingSurveyPreference(), "legal");
    await persistSurveyPreference(UID, answered, h.ports);

    h.setEngineWrites(false);
    const dismissed = applyCompletionDismissed(answered);
    strictEqual(dismissed.updatedAt, answered.updatedAt);
    strictEqual(dismissed.gatewaySyncedAt, answered.gatewaySyncedAt);
    await persistSurveyPreference(UID, dismissed, h.ports);

    h.setEngineWrites(true);
    const loaded = await loadSurveyPreference(UID, false, h.ports);
    strictEqual(loaded?.completionPromptDismissed, true);
    // …and the mirror was not rolled back to the engine's undismissed copy.
    ok(h.local.get(MIRROR_KEY)?.includes('"completionPromptDismissed":true'));
    // The engine copy is healed on the way out, so the next device agrees.
    ok(
      h.engine
        .get(ONBOARDING_SURVEY_PREF_KEY)
        ?.includes('"completionPromptDismissed":true'),
    );
  });

  it("does not let a stale mirror stamp bury an answer merged into the engine", async () => {
    // End to end through the store: the mirror carries a sync stamp, the engine
    // copy carries an answer folded in from another device at the SAME
    // `updatedAt`. The answer must survive the load, the stamp must not, and
    // the mirror must be rewritten with the reconciled record.
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
    strictEqual(loaded?.segment, "operations");
    strictEqual(loaded?.gatewaySyncedAt, null);
    ok(h.local.get(MIRROR_KEY)?.includes('"industry":"healthcare"'));
    // Nothing to heal — the engine already holds exactly this record.
    deepStrictEqual(h.writes, []);
  });

  it("keeps a mirror-only gateway stamp on a tie whose answers agree", async () => {
    // `markGatewaySynced` holds `updatedAt` too. The stamp is harmless to lose
    // today (a re-push is idempotent), but dropping it would order a needless
    // catch-up PUT — so it survives when nothing about the answers is in doubt.
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
    // Nothing monotone differs, so the account store stays the source of
    // truth and nothing is re-pushed.
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

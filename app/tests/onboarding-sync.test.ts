import {
  deepStrictEqual,
  doesNotMatch,
  match,
  ok,
  strictEqual,
} from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyIndustry,
  applySegment,
  createOnboardingSurveyPreference,
  markGatewaySynced,
  type OnboardingSurveyPreference,
} from "../src/lib/onboarding-survey.ts";
import {
  type GatewayFetchDeps,
  type GatewayOnboardingRecord,
  mergeGatewayOnboarding,
  onboardingGatewayAvailable,
  onboardingPatchFromSurvey,
  owesGatewayCatchUp,
  parseGatewayOnboarding,
  putGatewayOnboarding,
  requestGatewayOnboarding,
} from "../src/lib/onboarding-sync.ts";

// The module logs every non-fatal degradation; the failure cases below are
// deliberate, so keep the test output readable.
console.warn = () => {};

interface Sent {
  url: string;
  method: string;
  bearer: string | null;
  org: string | null;
  body: string | null;
}

function deps(
  responses: Array<Response | Error>,
  sent: Sent[],
  overrides?: Partial<GatewayFetchDeps>,
): GatewayFetchDeps {
  return {
    baseUrl: "https://gw.example/",
    token: () => "tok-1",
    refresh: async () => null,
    // A pinned team space, so every call below proves what it does with it.
    org: () => "fedcba9876543210",
    fetchFn: async (input, init) => {
      sent.push({
        url: String(input),
        method: init?.method ?? "GET",
        bearer: new Headers(init?.headers).get("Authorization"),
        org: new Headers(init?.headers).get("x-houston-org"),
        body: typeof init?.body === "string" ? init.body : null,
      });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? new Response(null, { status: 500 });
    },
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FULL_REMOTE: GatewayOnboardingRecord = {
  segment: "operations",
  industry: "healthcare",
  automationGoal: "chase overdue invoices",
  goalSkipped: false,
  segmentAnsweredAt: "2026-08-01T10:00:00.000Z",
  industryAnsweredAt: "2026-08-02T10:00:00.000Z",
  goalAnsweredAt: "2026-08-03T10:00:00.000Z",
};

describe("parseGatewayOnboarding", () => {
  it("keeps known ids and drops ones this build doesn't know", () => {
    deepStrictEqual(
      parseGatewayOnboarding({
        segment: "legal",
        industry: "quantum_widgets",
        automationGoal: "  file my taxes  ",
        goalSkipped: false,
        segmentAnsweredAt: "2026-08-01T10:00:00.000Z",
        industryAnsweredAt: null,
        goalAnsweredAt: "",
      }),
      {
        segment: "legal",
        industry: null,
        automationGoal: "file my taxes",
        goalSkipped: false,
        segmentAnsweredAt: "2026-08-01T10:00:00.000Z",
        industryAnsweredAt: null,
        goalAnsweredAt: null,
      },
    );
  });

  it("rejects a non-object body", () => {
    strictEqual(parseGatewayOnboarding("nope"), null);
    strictEqual(parseGatewayOnboarding(null), null);
  });
});

describe("requestGatewayOnboarding", () => {
  it("GETs /v1/me/onboarding with the live bearer", async () => {
    const sent: Sent[] = [];
    const record = await requestGatewayOnboarding(
      deps([json(FULL_REMOTE)], sent),
    );
    deepStrictEqual(record, FULL_REMOTE);
    strictEqual(sent[0].url, "https://gw.example/v1/me/onboarding");
    strictEqual(sent[0].method, "GET");
    strictEqual(sent[0].bearer, "Bearer tok-1");
  });

  it("asks as the USER, never as the pinned team space", async () => {
    // The route is user-scoped, but the gateway resolves `x-houston-org`
    // BEFORE the handler: a selector the caller is no longer a member of 403s
    // `not_member`, and the account's own answers would read as missing.
    const sent: Sent[] = [];
    await requestGatewayOnboarding(deps([json(FULL_REMOTE)], sent));
    strictEqual(sent[0].org, null);
  });

  it("answers null on a route the host doesn't serve", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await requestGatewayOnboarding(
        deps([new Response(null, { status: 404 })], sent),
      ),
      null,
    );
  });

  it("answers null when the request never leaves (offline)", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await requestGatewayOnboarding(
        deps([new TypeError("Load failed")], sent),
      ),
      null,
    );
  });

  it("sends nothing at all when there is no session", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await requestGatewayOnboarding(
        deps([json(FULL_REMOTE)], sent, { token: () => undefined }),
      ),
      null,
    );
    strictEqual(sent.length, 0);
  });

  it("refreshes once and replays on a 401", async () => {
    const sent: Sent[] = [];
    let refreshes = 0;
    const record = await requestGatewayOnboarding(
      deps([new Response(null, { status: 401 }), json(FULL_REMOTE)], sent, {
        refresh: async () => {
          refreshes++;
          return "fresh";
        },
      }),
    );
    strictEqual(refreshes, 1);
    deepStrictEqual(
      sent.map((s) => s.bearer),
      ["Bearer tok-1", "Bearer fresh"],
    );
    ok(record);
  });
});

describe("putGatewayOnboarding", () => {
  it("PUTs the trimmed subset and reports success", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await putGatewayOnboarding(deps([json(FULL_REMOTE)], sent), {
        industry: "legal",
        automationGoal: "  draft NDAs  ",
      }),
      true,
    );
    strictEqual(sent[0].method, "PUT");
    deepStrictEqual(JSON.parse(sent[0].body ?? ""), {
      industry: "legal",
      automationGoal: "draft NDAs",
    });
  });

  it("writes as the USER, never as the pinned team space", async () => {
    // The write gate derives billing from the pinned team, so with the header
    // on, a plain member of an expired team got a silent 403 storing their own
    // onboarding answers — and it burned the once-per-account catch-up.
    const sent: Sent[] = [];
    strictEqual(
      await putGatewayOnboarding(deps([json(FULL_REMOTE)], sent), {
        segment: "legal",
      }),
      true,
    );
    strictEqual(sent[0].org, null);
  });

  it("never sends a body the gateway would 400", async () => {
    const sent: Sent[] = [];
    strictEqual(await putGatewayOnboarding(deps([], sent), {}), false);
    strictEqual(
      await putGatewayOnboarding(deps([], sent), {
        segment: "astronaut" as never,
        automationGoal: "   ",
      }),
      false,
    );
    strictEqual(sent.length, 0);
  });

  it("reports failure on a server error", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await putGatewayOnboarding(
        deps([new Response(null, { status: 503 })], sent),
        {
          goalSkipped: true,
        },
      ),
      false,
    );
  });
});

describe("mergeGatewayOnboarding", () => {
  const local = (
    patch: Partial<OnboardingSurveyPreference>,
  ): OnboardingSurveyPreference => ({
    ...createOnboardingSurveyPreference(),
    ...patch,
  });

  it("fills only the questions this device has no answer for", () => {
    const merged = mergeGatewayOnboarding(
      local({ segment: "engineering", updatedAt: "2026-08-05T09:00:00.000Z" }),
      FULL_REMOTE,
    );
    ok(merged);
    strictEqual(merged.segment, "engineering"); // the local answer wins
    strictEqual(merged.industry, "healthcare");
    strictEqual(merged.automationGoal, "chase overdue invoices");
    strictEqual(merged.goalSkipped, false);
    strictEqual(merged.updatedAt, "2026-08-05T09:00:00.000Z");
    // Still ahead of the gateway (the segment was never pushed) — the catch-up
    // flush must still fire.
    strictEqual(merged.gatewaySyncedAt, null);
  });

  it("adopts a remote-only record as already synced", () => {
    const merged = mergeGatewayOnboarding(null, FULL_REMOTE);
    ok(merged);
    strictEqual(merged.segment, "operations");
    strictEqual(merged.industry, "healthcare");
    strictEqual(merged.updatedAt, "2026-08-03T10:00:00.000Z");
    ok(merged.gatewaySyncedAt);
  });

  it("carries a remote skip as an answered goal", () => {
    const merged = mergeGatewayOnboarding(local({ segment: "sales" }), {
      ...FULL_REMOTE,
      automationGoal: null,
      goalSkipped: true,
    });
    ok(merged);
    strictEqual(merged.automationGoal, null);
    strictEqual(merged.goalSkipped, true);
  });

  it("lets a remote skip win over remote text that should have been cleared", () => {
    // A contradictory row (text AND goal_skipped) means the user retracted the
    // text; resurrecting it would put words back in their mouth. `goalSkipped`
    // wins, and the text is dropped.
    const merged = mergeGatewayOnboarding(local({ segment: "sales" }), {
      ...FULL_REMOTE,
      automationGoal: "chase overdue invoices",
      goalSkipped: true,
    });
    ok(merged);
    strictEqual(merged.automationGoal, null);
    strictEqual(merged.goalSkipped, true);
  });

  it("reports no change when the gateway adds nothing", () => {
    const complete = local({
      segment: "operations",
      industry: "healthcare",
      automationGoal: "chase overdue invoices",
    });
    strictEqual(mergeGatewayOnboarding(complete, FULL_REMOTE), null);
    strictEqual(mergeGatewayOnboarding(complete, null), null);
  });

  it("does not mint an empty record when neither side knows anything", () => {
    strictEqual(
      mergeGatewayOnboarding(null, {
        segment: null,
        industry: null,
        automationGoal: null,
        goalSkipped: false,
        segmentAnsweredAt: null,
        industryAnsweredAt: null,
        goalAnsweredAt: null,
      }),
      null,
    );
  });
});

describe("onboardingPatchFromSurvey", () => {
  it("carries every stored answer", () => {
    deepStrictEqual(
      onboardingPatchFromSurvey({
        ...createOnboardingSurveyPreference(),
        segment: "design",
        industry: "retail",
        automationGoal: "sort my inbox",
      }),
      {
        segment: "design",
        industry: "retail",
        automationGoal: "sort my inbox",
      },
    );
  });

  it("carries a skipped goal as the skip flag", () => {
    deepStrictEqual(
      onboardingPatchFromSurvey({
        ...createOnboardingSurveyPreference(),
        goalSkipped: true,
      }),
      { goalSkipped: true },
    );
  });

  it("has nothing to push for an untouched record", () => {
    strictEqual(
      onboardingPatchFromSurvey(createOnboardingSurveyPreference()),
      null,
    );
  });

  it("asks the goal question exactly once, even from a contradictory record", () => {
    // Text and skip are mutually exclusive locally, but a record read off disk
    // could hold both. Sending both fields would fight the server's own
    // invariant; the text wins and the server clears goal_skipped for us.
    deepStrictEqual(
      onboardingPatchFromSurvey({
        ...createOnboardingSurveyPreference(),
        automationGoal: "sort my inbox",
        goalSkipped: true,
      }),
      { automationGoal: "sort my inbox" },
    );
  });
});

describe("owesGatewayCatchUp", () => {
  const unsynced = (
    patch: Partial<OnboardingSurveyPreference> = {},
  ): OnboardingSurveyPreference => ({
    ...createOnboardingSurveyPreference(),
    segment: "design",
    ...patch,
  });

  it("pushes an unsynced record once, then stays quiet", () => {
    const survey = unsynced();
    strictEqual(
      owesGatewayCatchUp({
        survey,
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: null,
      }),
      true,
    );
    strictEqual(
      owesGatewayCatchUp({
        survey,
        uid: "uid-1",
        flushedUid: "uid-1",
        pendingFlush: null,
      }),
      false,
    );
  });

  it("flushes again for the NEXT account signed in on this machine", () => {
    // The guard used to be a bare boolean, so the second account's unsynced
    // record was never caught up on this device.
    strictEqual(
      owesGatewayCatchUp({
        survey: unsynced(),
        uid: "uid-2",
        flushedUid: "uid-1",
        pendingFlush: null,
      }),
      true,
    );
    // Signed out is its own account slot, distinct from "never flushed".
    strictEqual(
      owesGatewayCatchUp({
        survey: unsynced(),
        uid: null,
        flushedUid: "uid-1",
        pendingFlush: null,
      }),
      true,
    );
    strictEqual(
      owesGatewayCatchUp({
        survey: unsynced(),
        uid: null,
        flushedUid: null,
        pendingFlush: null,
      }),
      false,
    );
  });

  it("leaves a record whose push a save already owns alone", () => {
    // The session's FIRST save used to trip this: the save writes the new
    // (unsynced) record into the query cache, the effect wakes on that write
    // and fired a second concurrent PUT of the same answer — and spent the
    // once-per-account latch doing it, so a genuinely failed push later in the
    // session got no retry at all.
    const survey = unsynced();
    strictEqual(
      owesGatewayCatchUp({
        survey,
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: survey.updatedAt,
      }),
      false,
    );
    // A DIFFERENT record is still owed its catch-up — the claim is per record.
    strictEqual(
      owesGatewayCatchUp({
        survey,
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: "2020-01-01T00:00:00.000Z",
      }),
      true,
    );
  });

  it("still owes a catch-up once that save's push has failed", () => {
    // The claim is released when the push settles, landed or not, and the
    // latch was never spent — so the record is caught up as designed.
    strictEqual(
      owesGatewayCatchUp({
        survey: unsynced(),
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: null,
      }),
      true,
    );
  });

  it("has nothing to catch up for a synced, empty or missing record", () => {
    strictEqual(
      owesGatewayCatchUp({
        survey: unsynced({ gatewaySyncedAt: "2026-08-08T10:00:00.000Z" }),
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: null,
      }),
      false,
    );
    strictEqual(
      owesGatewayCatchUp({
        survey: createOnboardingSurveyPreference(),
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: null,
      }),
      false,
    );
    strictEqual(
      owesGatewayCatchUp({
        survey: null,
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: null,
      }),
      false,
    );
  });
});

describe("a save pushes the WHOLE record", () => {
  it("carries an earlier answer whose own push never landed", async () => {
    // The scenario that loses an answer forever: the segment's PUT fails (the
    // claim is released, and nothing re-renders, so this session's catch-up
    // never wakes), then the industry's PUT succeeds and stamps the WHOLE
    // record as synced. With a per-save DELTA payload the segment is now
    // neither at the gateway nor owed to it — `owesGatewayCatchUp` skips a
    // stamped record and the gateway merge only ever fills local gaps.
    const sent: Sent[] = [];
    const gateway = deps(
      [new Response(null, { status: 503 }), json(FULL_REMOTE)],
      sent,
    );

    let record = applySegment(createOnboardingSurveyPreference(), "operations");
    const segmentLanded = await putGatewayOnboarding(
      gateway,
      onboardingPatchFromSurvey(record) ?? {},
    );
    strictEqual(segmentLanded, false);
    strictEqual(record.gatewaySyncedAt, null);

    record = applyIndustry(record, "healthcare");
    const industryLanded = await putGatewayOnboarding(
      gateway,
      onboardingPatchFromSurvey(record) ?? {},
    );
    strictEqual(industryLanded, true);
    record = markGatewaySynced(record, "2026-08-08T12:00:00.000Z");

    // The second body carries BOTH answers, so the stamp it earns is truthful.
    deepStrictEqual(JSON.parse(sent[1].body ?? ""), {
      segment: "operations",
      industry: "healthcare",
    });
    strictEqual(
      owesGatewayCatchUp({
        survey: record,
        uid: "uid-1",
        flushedUid: undefined,
        pendingFlush: null,
      }),
      false,
    );
  });
});

describe("flush ownership wiring", () => {
  // The push rules themselves are driven end to end in
  // `onboarding-survey-push.test.ts`; what is left here is the REACT wiring
  // those rules depend on, which node:test cannot render.
  const read = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const hook = read("../src/hooks/use-onboarding-survey.ts");
  const sync = read("../src/hooks/onboarding-survey-flush.ts");

  it("claims the push BEFORE the cache write that wakes the catch-up", () => {
    match(hook, /if \(pushesAnswers\) claim\(next\);\s*\n\s*qc\.setQueryData/);
  });

  it("hands the flush the RECORD, and never a per-save delta", () => {
    match(hook, /if \(pushesAnswers\) void flush\(next\);/);
    doesNotMatch(hook, /=> \(\{ segment \}\)|=> \(\{ industry \}\)/);
  });

  it("feeds the claim into the catch-up and latches only when it pushes", () => {
    match(sync, /pendingFlush: pusher\.claimed\(\),/);
    match(sync, /if \(!owed \|\| !survey\) return;[\s\S]*?flushedUid\.current/);
  });
});

describe("onboardingGatewayAvailable", () => {
  it("is on for the hosted desktop and the web, off for a local sidecar", () => {
    strictEqual(
      onboardingGatewayAvailable({ hostedGateway: true, isTauri: true }),
      true,
    );
    strictEqual(
      onboardingGatewayAvailable({ hostedGateway: false, isTauri: false }),
      true,
    );
    strictEqual(
      onboardingGatewayAvailable({ hostedGateway: false, isTauri: true }),
      false,
    );
  });
});

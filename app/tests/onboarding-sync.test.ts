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
  applyRole,
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
  segment: null,
  role: "medical_receptionist",
  industry: "healthcare",
  companySize: "11_50",
  automationGoal: "chase overdue invoices",
  goalSkipped: false,
  segmentAnsweredAt: null,
  roleAnsweredAt: "2026-08-01T10:00:00.000Z",
  industryAnsweredAt: "2026-08-02T10:00:00.000Z",
  companySizeAnsweredAt: "2026-08-02T11:00:00.000Z",
  goalAnsweredAt: "2026-08-03T10:00:00.000Z",
};

describe("parseGatewayOnboarding", () => {
  it("keeps known ids and folds an unknown industry or role into something_else", () => {
    deepStrictEqual(
      parseGatewayOnboarding({
        segment: "legal",
        role: "role_from_a_newer_catalog",
        industry: "quantum_widgets",
        companySize: "a_bucket_from_a_newer_build",
        automationGoal: "  file my taxes  ",
        goalSkipped: false,
        segmentAnsweredAt: "2026-08-01T10:00:00.000Z",
        roleAnsweredAt: "2026-08-04T10:00:00.000Z",
        industryAnsweredAt: null,
        companySizeAnsweredAt: "2026-08-04T11:00:00.000Z",
        goalAnsweredAt: "",
      }),
      {
        segment: "legal",
        role: "something_else",
        industry: "something_else",
        companySize: null,
        automationGoal: "file my taxes",
        goalSkipped: false,
        segmentAnsweredAt: "2026-08-01T10:00:00.000Z",
        roleAnsweredAt: "2026-08-04T10:00:00.000Z",
        industryAnsweredAt: null,
        companySizeAnsweredAt: "2026-08-04T11:00:00.000Z",
        goalAnsweredAt: null,
      },
    );
  });

  it("keeps a leadership position and a company size it knows", () => {
    const record = parseGatewayOnboarding({
      role: "founder",
      companySize: "solo",
      companySizeAnsweredAt: "2026-08-04T11:00:00.000Z",
    });
    strictEqual(record?.role, "founder");
    strictEqual(record?.companySize, "solo");
    strictEqual(record?.companySizeAnsweredAt, "2026-08-04T11:00:00.000Z");
  });

  it("reads a legacy row, answered before the role question, as it is", () => {
    const legacy = parseGatewayOnboarding({
      segment: "operations",
      industry: null,
      automationGoal: null,
      goalSkipped: false,
      segmentAnsweredAt: "2026-08-01T10:00:00.000Z",
      industryAnsweredAt: null,
      goalAnsweredAt: null,
    });
    strictEqual(legacy?.segment, "operations");
    strictEqual(legacy?.role, null);
    strictEqual(legacy?.roleAnsweredAt, null);
    strictEqual(legacy?.companySize, null);
    strictEqual(legacy?.companySizeAnsweredAt, null);
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
      await putGatewayOnboarding(
        deps(
          [
            json({
              ...FULL_REMOTE,
              industry: "legal",
              automationGoal: "draft NDAs",
            }),
          ],
          sent,
        ),
        { industry: "legal", automationGoal: "  draft NDAs  " },
      ),
      true,
    );
    strictEqual(sent[0].method, "PUT");
    deepStrictEqual(JSON.parse(sent[0].body ?? ""), {
      industry: "legal",
      automationGoal: "draft NDAs",
    });
  });

  it("pins the body byte for byte: the role, never the retired department", async () => {
    const sent: Sent[] = [];
    await putGatewayOnboarding(deps([json(FULL_REMOTE)], sent), {
      role: "paralegal",
      industry: "legal",
      automationGoal: "Draft NDAs",
    });
    strictEqual(sent[0].url, "https://gw.example/v1/me/onboarding");
    strictEqual(
      sent[0].body,
      '{"role":"paralegal","industry":"legal","automationGoal":"Draft NDAs"}',
    );
  });

  it("pins the company size and a leadership role byte for byte", async () => {
    const sent: Sent[] = [];
    await putGatewayOnboarding(deps([json(FULL_REMOTE)], sent), {
      role: "ceo",
      companySize: "201_1000",
    });
    strictEqual(sent[0].body, '{"role":"ceo","companySize":"201_1000"}');
  });

  it("sends every company size and its skip as they are", async () => {
    for (const companySize of [
      "solo",
      "2_10",
      "11_50",
      "51_200",
      "201_1000",
      "1000_plus",
      "skipped",
    ] as const) {
      const sent: Sent[] = [];
      await putGatewayOnboarding(deps([json(FULL_REMOTE)], sent), {
        companySize,
      });
      strictEqual(sent[0].body, JSON.stringify({ companySize }));
    }
  });

  it("sends the two role answers outside the catalog as they are", async () => {
    for (const role of ["something_else", "skipped"] as const) {
      const sent: Sent[] = [];
      await putGatewayOnboarding(deps([json(FULL_REMOTE)], sent), { role });
      strictEqual(sent[0].body, JSON.stringify({ role }));
    }
  });

  it("writes as the USER, never as the pinned team space", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await putGatewayOnboarding(
        deps([json({ ...FULL_REMOTE, role: "paralegal" })], sent),
        { role: "paralegal" },
      ),
      true,
    );
    strictEqual(sent[0].org, null);
  });

  it("is not synced when the gateway's answer lacks a field it was sent", async () => {
    const sent: Sent[] = [];
    const { role: _dropped, ...olderGateway } = FULL_REMOTE;
    strictEqual(
      await putGatewayOnboarding(
        deps([json({ ...olderGateway, industry: "legal" })], sent),
        { role: "ceo", industry: "legal" },
      ),
      false,
    );
    strictEqual(sent.length, 1);
  });

  it("stores the rest when one field is refused, and stays owed", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await putGatewayOnboarding(
        deps(
          [
            json({ error: "role unknown", code: "invalid_role" }, 400),
            json({ ...FULL_REMOTE, industry: "legal", companySize: "2_10" }),
          ],
          sent,
        ),
        { role: "ceo", industry: "legal", companySize: "2_10" },
      ),
      false,
    );
    deepStrictEqual(
      sent.map((s) => s.body),
      [
        '{"role":"ceo","industry":"legal","companySize":"2_10"}',
        '{"industry":"legal","companySize":"2_10"}',
      ],
    );
  });

  it("sends nothing more when the refused field was all it held", async () => {
    const sent: Sent[] = [];
    strictEqual(
      await putGatewayOnboarding(
        deps([json({ code: "invalid_company_size" }, 400)], sent),
        { companySize: "2_10" },
      ),
      false,
    );
    strictEqual(sent.length, 1);
  });

  it("never sends a body the gateway would 400", async () => {
    const sent: Sent[] = [];
    strictEqual(await putGatewayOnboarding(deps([], sent), {}), false);
    strictEqual(
      await putGatewayOnboarding(deps([], sent), {
        role: "astronaut" as never,
        companySize: "huge" as never,
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
      local({ role: "paralegal", updatedAt: "2026-08-05T09:00:00.000Z" }),
      FULL_REMOTE,
    );
    ok(merged);
    strictEqual(merged.role, "paralegal");
    strictEqual(merged.industry, "healthcare");
    strictEqual(merged.companySize, "11_50");
    strictEqual(merged.automationGoal, "chase overdue invoices");
    strictEqual(merged.goalSkipped, false);
    strictEqual(merged.updatedAt, "2026-08-05T09:00:00.000Z");
    strictEqual(merged.gatewaySyncedAt, null);
  });

  it("keeps a local company size over the gateway's", () => {
    const merged = mergeGatewayOnboarding(
      local({ role: "founder", companySize: "solo" }),
      FULL_REMOTE,
    );
    strictEqual(merged?.companySize, "solo");
  });

  it("adopts a remote-only record as already synced", () => {
    const merged = mergeGatewayOnboarding(null, FULL_REMOTE);
    ok(merged);
    strictEqual(merged.role, "medical_receptionist");
    strictEqual(merged.industry, "healthcare");
    strictEqual(merged.updatedAt, "2026-08-03T10:00:00.000Z");
    ok(merged.gatewaySyncedAt);
  });

  it("carries a remote skip as an answered goal", () => {
    const merged = mergeGatewayOnboarding(local({ role: "paralegal" }), {
      ...FULL_REMOTE,
      automationGoal: null,
      goalSkipped: true,
    });
    ok(merged);
    strictEqual(merged.automationGoal, null);
    strictEqual(merged.goalSkipped, true);
  });

  it("lets a remote skip win over remote text that should have been cleared", () => {
    const merged = mergeGatewayOnboarding(local({ role: "paralegal" }), {
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
      role: "medical_receptionist",
      industry: "healthcare",
      companySize: "11_50",
      automationGoal: "chase overdue invoices",
    });
    strictEqual(mergeGatewayOnboarding(complete, FULL_REMOTE), null);
    strictEqual(mergeGatewayOnboarding(complete, null), null);
  });

  it("does not mint an empty record when neither side knows anything", () => {
    strictEqual(
      mergeGatewayOnboarding(null, {
        segment: null,
        role: null,
        industry: null,
        companySize: null,
        automationGoal: null,
        goalSkipped: false,
        segmentAnsweredAt: null,
        roleAnsweredAt: null,
        industryAnsweredAt: null,
        companySizeAnsweredAt: null,
        goalAnsweredAt: null,
      }),
      null,
    );
  });

  it("brings a legacy department answered on another device, so the role is never asked", () => {
    const merged = mergeGatewayOnboarding(null, {
      ...FULL_REMOTE,
      segment: "operations",
      role: null,
      segmentAnsweredAt: "2026-08-01T10:00:00.000Z",
      roleAnsweredAt: null,
    });
    ok(merged);
    strictEqual(merged.segment, "operations");
    strictEqual(merged.role, null);
  });
});

describe("onboardingPatchFromSurvey", () => {
  it("carries every stored answer", () => {
    deepStrictEqual(
      onboardingPatchFromSurvey({
        ...createOnboardingSurveyPreference(),
        role: "merchandiser",
        industry: "retail_ecommerce",
        companySize: "51_200",
        automationGoal: "sort my inbox",
      }),
      {
        role: "merchandiser",
        industry: "retail_ecommerce",
        companySize: "51_200",
        automationGoal: "sort my inbox",
      },
    );
  });

  it("never pushes back a something-else read off the gateway without words", () => {
    deepStrictEqual(
      onboardingPatchFromSurvey({
        ...createOnboardingSurveyPreference(),
        role: "something_else",
        industry: "something_else",
        companySize: "2_10",
      }),
      { companySize: "2_10" },
    );
    deepStrictEqual(
      onboardingPatchFromSurvey({
        ...createOnboardingSurveyPreference(),
        role: "something_else",
        roleOther: "Dog groomer",
        industry: "something_else",
        industryOther: "Pet care",
      }),
      { role: "something_else", industry: "something_else" },
    );
  });

  it("never pushes the retired department it carries", () => {
    strictEqual(
      onboardingPatchFromSurvey({
        ...createOnboardingSurveyPreference(),
        segment: "design",
      }),
      null,
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
    role: "merchandiser",
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
    strictEqual(
      owesGatewayCatchUp({
        survey: unsynced(),
        uid: "uid-2",
        flushedUid: "uid-1",
        pendingFlush: null,
      }),
      true,
    );
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
    const sent: Sent[] = [];
    const gateway = deps(
      [new Response(null, { status: 503 }), json(FULL_REMOTE)],
      sent,
    );

    let record = applyIndustry(
      createOnboardingSurveyPreference(),
      "healthcare",
    );
    const industryLanded = await putGatewayOnboarding(
      gateway,
      onboardingPatchFromSurvey(record) ?? {},
    );
    strictEqual(industryLanded, false);
    strictEqual(record.gatewaySyncedAt, null);

    record = applyRole(record, "medical_receptionist");
    const roleLanded = await putGatewayOnboarding(
      gateway,
      onboardingPatchFromSurvey(record) ?? {},
    );
    strictEqual(roleLanded, true);
    record = markGatewaySynced(record, "2026-08-08T12:00:00.000Z");

    deepStrictEqual(JSON.parse(sent[1].body ?? ""), {
      role: "medical_receptionist",
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
  const read = (relativePath: string) =>
    readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const hook = read("../src/hooks/use-onboarding-survey.ts");
  const sync = read("../src/hooks/onboarding-survey-flush.ts");

  it("claims the push BEFORE the cache write that wakes the catch-up", () => {
    match(hook, /if \(pushesAnswers\) claim\(next\);\s*\n\s*qc\.setQueryData/);
  });

  it("hands the flush the RECORD, and never a per-save delta", () => {
    match(hook, /if \(pushesAnswers\) void flush\(next\);/);
    doesNotMatch(hook, /=> \(\{ role \}\)|=> \(\{ industry \}\)/);
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

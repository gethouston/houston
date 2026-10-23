import { equal, ok } from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import {
  type TriggerPlanSkipNotice,
  triggerPlanSkipNotice,
} from "@houston/sdk";
import type { OrgBilling, TriggerPlanSkipCode } from "@houston/wire-types";
import en from "../src/locales/en/plan.json" with { type: "json" };
import es from "../src/locales/es/plan.json" with { type: "json" };
import pt from "../src/locales/pt/plan.json" with { type: "json" };
import { enterNativeApp } from "./support/native-surface.ts";

// The routine screen and runs dialog notice for trigger events the Free plan
// refused: the SDK picks the reason and the actions, the view says it in the
// person's language with one button per action.

const resources = { en, es, pt };
type Language = keyof typeof resources;
let render: (
  notice: TriggerPlanSkipNotice,
  language?: Language,
) => Promise<string>;

const free: OrgBilling = {
  tier: "free",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: true,
  isBillingOwner: true,
  seats: 1,
  interval: null,
  seatPriceCents: 2000,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  usage: null,
  routines: {
    paused: false,
    kept: null,
    maxActive: 1,
    minIntervalMinutes: 15,
    needsChoice: false,
    limitedCount: 0,
  },
};

const creator: TriggerPlanSkipViewer = {
  createdBy: "u1",
  viewerId: "u1",
  agentSlug: "agent-a",
  plusOffer: true,
};

function noticeFor(
  code: TriggerPlanSkipCode,
  count: number,
  plan: OrgBilling = free,
  viewer: TriggerPlanSkipViewer = creator,
): TriggerPlanSkipNotice {
  const notice = triggerPlanSkipNotice(
    {
      routine_id: "r1",
      status: "active",
      plan_skipped: { code, count, last_at: "2026-10-05T19:43:49Z" },
    },
    plan,
    viewer,
  );
  if (!notice) throw new Error(`no notice for ${code}`);
  return notice;
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["plan"],
    resources: { en: { plan: en }, es: { plan: es }, pt: { plan: pt } },
  });
  const { RoutinePlanSkipNoticeView } = await import(
    "../src/components/agent/routine-plan-skip-notice-view.tsx"
  );
  render = async (notice, language = "en") => {
    await i18next.changeLanguage(language);
    return text(
      renderToStaticMarkup(
        React.createElement(RoutinePlanSkipNoticeView, {
          notice,
          onAction: () => undefined,
        }),
      ),
    );
  };
});

describe("RoutinePlanSkipNoticeView", () => {
  it("counts the skipped events and points to Plus", async () => {
    const html = await render(noticeFor("plan_min_interval", 21));
    ok(
      html.includes(
        "21 runs of this routine were skipped in the last 24 hours",
      ),
      html,
    );
    ok(html.includes(en.triggerSkipped.minInterval), html);
    ok(html.includes(en.upgrade), html);
    ok(!html.includes(en.resume), html);
  });

  it("offers no upgrade to a reader who does not pay for the org", async () => {
    const team = { ...creator, plusOffer: false };
    const interval = await render(
      noticeFor("plan_min_interval", 2, free, team),
    );
    ok(interval.includes(en.triggerSkipped.minIntervalNoOffer), interval);
    ok(!interval.includes(en.upgrade), interval);
    const limit = await render(noticeFor("plan_routine_limit", 2, free, team));
    ok(limit.includes(en.chooseRoutine), limit);
    ok(!limit.includes(en.upgrade), limit);
  });

  it("says a locked org's routines wait for it to be paid for", async () => {
    const locked: OrgBilling = {
      ...free,
      status: "locked",
      lockAt: "2026-10-01T00:00:00Z",
      lockReason: "migration",
    };
    const html = await render(
      noticeFor("plan_inactive", 2, locked, { ...creator, plusOffer: false }),
    );
    ok(html.includes(en.triggerSkipped.orgLocked), html);
    ok(!html.includes(en.resume), html);
  });

  it("uses the singular for one event", async () => {
    const html = await render(noticeFor("plan_min_interval", 1));
    ok(html.includes("1 run of this routine was skipped"), html);
  });

  it("offers to keep this routine on the routine limit", async () => {
    const html = await render(noticeFor("plan_routine_limit", 3));
    ok(html.includes(en.triggerSkipped.routineLimit.slice(0, 30)), html);
    ok(html.includes(en.chooseRoutine), html);
    ok(html.includes(en.upgrade), html);
  });

  it("offers Resume only while routines are still paused", async () => {
    const paused = await render(
      noticeFor("plan_inactive", 2, {
        ...free,
        routines: { ...(free.routines as never), paused: true },
      }),
    );
    ok(paused.includes(en.triggerSkipped.inactivePaused), paused);
    ok(paused.includes(en.resume), paused);
    const running = await render(noticeFor("plan_inactive", 2));
    ok(running.includes(en.triggerSkipped.inactiveResumed), running);
    equal(running.includes(en.resume), false);
  });

  it("asks to resume before choosing a routine while paused", async () => {
    const html = await render(
      noticeFor("plan_routine_limit", 2, {
        ...free,
        routines: { ...(free.routines as never), paused: true },
      }),
    );
    ok(html.includes(en.triggerSkipped.routineLimitPaused), html);
    ok(html.includes(en.resume), html);
    equal(html.includes(en.chooseRoutine), false);
  });

  it("tells a teammate it ran on the creator's plan, with no actions", async () => {
    const html = await render(
      noticeFor(
        "plan_routine_limit",
        4,
        { ...free, tier: "paid", usage: null, routines: null },
        {
          ...creator,
          viewerId: "u2",
        },
      ),
    );
    ok(html.includes(en.triggerSkipped.creatorPlan), html);
    for (const action of [en.upgrade, en.chooseRoutine, en.resume])
      equal(html.includes(action), false, action);
  });

  for (const language of ["es", "pt"] as const) {
    it(`renders authored copy in ${language}`, async () => {
      const html = await render(noticeFor("plan_min_interval", 21), language);
      ok(html.includes("21"), html);
      ok(html.includes(resources[language].upgrade), html);
      equal(html.includes("skipped"), false);
    });
  }
});

// Inside the iOS/Android app Houston never sells: Upgrade is dropped and the
// copy that pointed to Plus says the plan is managed on the web instead.
describe("RoutinePlanSkipNoticeView inside a store app", () => {
  let leave: (() => void) | null = null;
  afterEach(() => {
    leave?.();
    leave = null;
  });

  it("drops Upgrade and points to the web on the interval floor", async () => {
    leave = enterNativeApp();
    const html = await render(noticeFor("plan_min_interval", 21));
    ok(html.includes(en.native.triggerSkipped.minInterval), html);
    equal(html.includes(en.upgrade), false, html);
    equal(html.includes("Plus"), false, html);
  });

  it("keeps Choose routine and drops Upgrade on the routine limit", async () => {
    leave = enterNativeApp("android");
    const html = await render(noticeFor("plan_routine_limit", 3));
    ok(html.includes(en.native.triggerSkipped.routineLimit), html);
    ok(html.includes(en.chooseRoutine), html);
    equal(html.includes(en.upgrade), false, html);
  });

  it("keeps Resume and drops Upgrade while routines are paused", async () => {
    leave = enterNativeApp();
    const html = await render(
      noticeFor("plan_inactive", 2, {
        ...free,
        routines: { ...(free.routines as never), paused: true },
      }),
    );
    ok(html.includes(en.resume), html);
    equal(html.includes(en.upgrade), false, html);
  });

  it("tells a teammate about the creator's plan without naming Plus", async () => {
    leave = enterNativeApp();
    const html = await render(
      noticeFor(
        "plan_routine_limit",
        4,
        { ...free, tier: "paid", usage: null, routines: null },
        { ...creator, viewerId: "u2" },
      ),
    );
    ok(html.includes(en.native.triggerSkipped.creatorPlan), html);
    equal(html.includes("Plus"), false, html);
  });

  for (const language of ["es", "pt"] as const) {
    it(`renders the store copy in ${language}`, async () => {
      leave = enterNativeApp();
      const html = await render(noticeFor("plan_min_interval", 21), language);
      ok(
        html.includes(resources[language].native.triggerSkipped.minInterval),
        html,
      );
      equal(html.includes(resources[language].upgrade), false, html);
    });
  }
});

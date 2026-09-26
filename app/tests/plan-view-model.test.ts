import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { PlanSummary } from "@houston/engine-adapter";
import {
  billingCards,
  createPlanAnnouncementActions,
  formatPlanAmount,
  invoiceStatusKey,
  planAnnouncementView,
  planComposerMode,
  planDialog,
  planLaunchRefreshDelay,
  planOffer,
  planPriceAmounts,
  planUsageMode,
  usagePercent,
} from "@houston/sdk";

const free: PlanSummary = {
  plan: "free",
  announcement: false,
  usage: {
    percent: 100,
    used: 40,
    limit: 40,
    resetsAt: "2026-10-01T00:00:00Z",
  },
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "USD", interval: "month" },
  },
  routines: {
    paused: true,
    maxActive: 1,
    minIntervalMinutes: 15,
    needsChoice: true,
    limitedCount: 1,
  },
};
const BEFORE_LAUNCH = Date.parse("2026-09-25T00:00:00Z");
const AFTER_LAUNCH = Date.parse("2026-10-02T00:00:00Z");

test("usage is shown only as a bounded percentage", () => {
  assert.equal(usagePercent(free), 100);
  assert.equal(
    usagePercent({ ...free, usage: { percent: 150, used: 60, limit: 40 } }),
    100,
  );
  assert.equal(usagePercent({ ...free, plan: "plus" }), null);
});

test("announcement view routes the offer to checkout and the plain plan to Billing", () => {
  const launch: PlanSummary = {
    ...free,
    announcement: true,
    limitsStartAt: "2026-10-01T12:00:00Z",
    plus: {
      ...free.plus,
      price: { ...free.plus.price, compareAt: 2000 },
      offer: {
        amount: 1000,
        currency: "USD",
        coversFrom: "2026-10-01T12:00:00Z",
        coversUntil: "2026-11-01T12:00:00Z",
        endsAt: "2026-10-01T12:00:00Z",
      },
    },
  };
  const withOffer = planAnnouncementView(launch, "en-US", BEFORE_LAUNCH);
  assert.equal(withOffer.action, "checkout");
  assert.equal(withOffer.starts, "October 1");
  assert.equal(withOffer.free, "$0");
  assert.equal(withOffer.plus.compareAt, "$20");
  assert.equal(withOffer.plus.current, "$15");
  assert.equal(withOffer.offer?.amount, "$10");
  assert.equal(withOffer.offer?.until, "November 1");
  const withoutOffer = planAnnouncementView(
    { ...launch, plus: { ...launch.plus, offer: undefined } },
    "en-US",
    BEFORE_LAUNCH,
  );
  assert.equal(withoutOffer.action, "plans");
  assert.equal(withoutOffer.offer, null);
});

test("closing dismisses once; the primary action follows the offer", () => {
  let count = 0;
  const closing = createPlanAnnouncementActions({
    dismiss: () => {
      count += 1;
    },
    checkout: () => assert.fail("checkout on close"),
    openPlans: () => assert.fail("Billing on close"),
  });
  closing.close();
  closing.close();
  assert.equal(count, 1);
  let dismissed = 0;
  let checkout = 0;
  let plans = 0;
  const actions = createPlanAnnouncementActions({
    dismiss: () => {
      dismissed += 1;
    },
    checkout: () => {
      checkout += 1;
    },
    openPlans: () => {
      plans += 1;
    },
  });
  actions.primary("checkout");
  assert.deepEqual([dismissed, checkout, plans], [0, 1, 0]);
  actions.primary("plans");
  assert.deepEqual([dismissed, checkout, plans], [1, 1, 1]);
});

test("announcement copy never promises unlimited use or refers to messages", () => {
  for (const language of ["en", "es", "pt"]) {
    const json = JSON.parse(
      readFileSync(
        new URL(`../src/locales/${language}/plan.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const copy = Object.entries(json)
      .filter(([key]) => key.startsWith("announcement"))
      .map(([, value]) => value)
      .join(" ");
    assert.doesNotMatch(copy, /unlimited|messages/i);
  }
});

test("resume wins over keep until dismissed for this session", () => {
  assert.equal(planDialog(free, false), "resume");
  assert.equal(planDialog(free, true), "keep");
  assert.equal(
    planDialog(
      {
        ...free,
        routines: {
          paused: false,
          maxActive: 1,
          minIntervalMinutes: 15,
          needsChoice: false,
          limitedCount: 0,
        },
      },
      true,
    ),
    null,
  );
});

test("billing cards follow Free and Plus states", () => {
  assert.deepEqual(billingCards(free), {
    upgrade: true,
    usage: true,
    manage: false,
    renewal: "none",
    routine: "paused",
  });
  const plus = {
    ...free,
    plan: "plus" as const,
    plus: {
      ...free.plus,
      status: "active" as const,
      manageable: true,
      renewsAt: "2026-10-01T00:00:00Z",
    },
  };
  assert.equal(billingCards(plus).renewal, "renews");
  assert.equal(billingCards(plus).manage, true);
  assert.equal(billingCards(plus).upgrade, false);
  assert.equal(
    billingCards({
      ...plus,
      plus: { ...plus.plus, cancelAtPeriodEnd: true },
    }).renewal,
    "ends",
  );
  assert.equal(
    billingCards({
      ...plus,
      plus: { ...plus.plus, status: "past_due" },
    }).renewal,
    "paymentIssue",
  );
});

test("invoice labels and minor-unit prices are stable", () => {
  for (const status of [
    "draft",
    "open",
    "paid",
    "uncollectible",
    "void",
  ] as const)
    assert.equal(invoiceStatusKey(status), status);
  assert.equal(formatPlanAmount(1500, "USD", "en-US"), "$15");
  assert.equal(formatPlanAmount(1499, "USD", "en-US"), "$14.99");
  assert.equal(formatPlanAmount(1500, "JPY", "ja-JP"), "￥1,500");
});

test("launch prices and offer amounts use the summary without changing the real price", () => {
  assert.deepEqual(planPriceAmounts(free, "en-US"), {
    current: "$15",
    compareAt: null,
  });
  const launch: PlanSummary = {
    ...free,
    plus: {
      ...free.plus,
      price: { ...free.plus.price, compareAt: 2000 },
      offer: {
        amount: 1000,
        currency: "USD",
        coversFrom: "2026-10-01T00:00:00Z",
        coversUntil: "2026-11-01T00:00:00Z",
        endsAt: "2026-10-01T00:00:00Z",
      },
    },
  };
  assert.deepEqual(planPriceAmounts(launch, "en-US"), {
    current: "$15",
    compareAt: "$20",
  });
  assert.equal(planOffer(launch, "en-US", BEFORE_LAUNCH)?.amount, "$10");
  assert.equal(
    planOffer({ ...launch, plan: "plus" }, "en-US", BEFORE_LAUNCH),
    null,
  );
});

test("preview hints remain hints at 100 percent and announcement waits for routine dialogs", () => {
  const preview: PlanSummary = {
    ...free,
    announcement: true,
    limitsStartAt: "2026-10-01T00:00:00Z",
  };
  assert.equal(planUsageMode(preview, BEFORE_LAUNCH), "preview");
  assert.equal(planComposerMode(preview, BEFORE_LAUNCH), "previewHint");
  assert.equal(planUsageMode(preview, AFTER_LAUNCH), "current");
  assert.equal(planComposerMode(preview, AFTER_LAUNCH), "limit");
  assert.equal(planDialog(preview, false), "resume");
  assert.equal(planDialog(preview, true), "keep");
  assert.equal(planDialog(preview, true, true), "announcement");
  assert.equal(
    planDialog({ ...preview, announcement: false }, true, true),
    null,
  );
  assert.equal(planDialog({ ...preview, plan: "plus" }, true, true), null);
  assert.equal(planUsageMode(free), "current");
  assert.equal(planComposerMode(free), "limit");
});

test("offer copy inputs are available to card, popup, and preview hint only before launch", () => {
  const before: PlanSummary = {
    ...free,
    usage: { percent: 90, used: 36, limit: 40 },
    announcement: true,
    limitsStartAt: "2026-10-01T07:00:00Z",
    plus: {
      ...free.plus,
      offer: {
        amount: 1000,
        currency: "USD",
        coversFrom: "2026-10-01T07:00:00Z",
        coversUntil: "2026-11-01T07:00:00Z",
        endsAt: "2026-10-01T07:00:00Z",
      },
    },
  };
  assert.equal(planOffer(before, "en-US", BEFORE_LAUNCH)?.amount, "$10");
  assert.equal(planOffer(before, "en-US", AFTER_LAUNCH), null);
  assert.equal(planComposerMode(before, BEFORE_LAUNCH), "previewHint");
  assert.equal(
    planLaunchRefreshDelay(before, BEFORE_LAUNCH),
    Date.parse("2026-10-01T07:00:00Z") - BEFORE_LAUNCH + 250,
  );
  assert.equal(planDialog(before, true, true), "announcement");
  const after: PlanSummary = {
    ...before,
    usage: free.usage,
    limitsStartAt: undefined,
    plus: { ...before.plus, offer: undefined },
    announcement: false,
  };
  assert.equal(planOffer(after, "en-US"), null);
  assert.equal(planComposerMode(after), "limit");
  assert.equal(planDialog(after, true, true), null);
});

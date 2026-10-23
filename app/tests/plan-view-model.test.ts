import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { OrgBilling, PlanSummary } from "@houston/engine-adapter";
import {
  billingCards,
  createPlanAnnouncementActions,
  formatPlanAmount,
  invoiceStatusKey,
  planAnnouncementDue,
  planAnnouncementView,
  planComposerMode,
  planDialog,
  planLaunchRefreshDelay,
  planOffer,
  planPriceAmounts,
  planSummaryPercent,
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

/** The active free org at its pool's limit, with routines paused and over. */
const freeOrg: OrgBilling = {
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
  renewsAt: null,
  priceNotice: null,
  usage: {
    scope: "org",
    used: 40,
    limit: 40,
    resetsAt: "2026-10-01T00:00:00Z",
  },
  routines: {
    paused: true,
    kept: null,
    needsChoice: true,
    limitedCount: 1,
    maxActive: 1,
    minIntervalMinutes: 15,
  },
};
const paidOrg: OrgBilling = {
  ...freeOrg,
  tier: "paid",
  usage: null,
  routines: null,
};
const dialogs = (
  billing: OrgBilling,
  resumeDismissed: boolean,
  keepDismissed = false,
  announcement = false,
) =>
  planDialog(billing, {
    resumeDismissed,
    keepDismissed,
    keepRequested: false,
    announcement,
  });

test("usage is shown only as a bounded percentage", () => {
  assert.equal(usagePercent(freeOrg), 100);
  assert.equal(
    usagePercent({
      ...freeOrg,
      usage: {
        ...freeOrg.usage,
        scope: "org",
        used: 60,
        limit: 40,
        resetsAt: "2026-10-01T00:00:00Z",
      },
    }),
    100,
  );
  assert.equal(usagePercent(paidOrg), null);
  assert.equal(planSummaryPercent(free), 100);
  assert.equal(planSummaryPercent({ ...free, plan: "plus" }), null);
});

test("announcement view routes the offer to checkout and the plain plan to Billing", () => {
  const launch: PlanSummary = {
    ...free,
    announcement: true,
    limitsStartAt: "2026-10-01T12:00:00Z",
    plus: {
      ...free.plus,
      price: { ...free.plus.price, compareAt: 2000 },
      offer: { amount: 1000, currency: "USD" },
    },
  };
  const withOffer = planAnnouncementView(launch, "en-US");
  assert.equal(withOffer.action, "checkout");
  assert.equal(withOffer.starts, "October 1");
  assert.equal(withOffer.free, "$0");
  assert.equal(withOffer.plus.compareAt, "$20");
  assert.equal(withOffer.plus.current, "$15");
  assert.deepEqual(withOffer.offer, { amount: "$10" });
  const withoutOffer = planAnnouncementView(
    { ...launch, plus: { ...launch.plus, offer: undefined } },
    "en-US",
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
  assert.equal(dialogs(freeOrg, false), "resume");
  assert.equal(dialogs(freeOrg, true), "keep");
  assert.equal(
    dialogs(
      {
        ...freeOrg,
        routines: {
          paused: false,
          kept: null,
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
      offer: { amount: 1000, currency: "USD" },
    },
  };
  assert.deepEqual(planPriceAmounts(launch, "en-US"), {
    current: "$15",
    compareAt: "$20",
  });
  assert.equal(planOffer(launch, "en-US")?.amount, "$10");
  assert.equal(planOffer({ ...launch, plan: "plus" }, "en-US"), null);
});

test("the Plan screen previews usage before the launch; the announcement waits for routine dialogs", () => {
  const preview: PlanSummary = {
    ...free,
    announcement: true,
    limitsStartAt: "2026-10-01T00:00:00Z",
  };
  assert.equal(planUsageMode(preview, BEFORE_LAUNCH), "preview");
  assert.equal(planUsageMode(preview, AFTER_LAUNCH), "current");
  const due = planAnnouncementDue(preview);
  assert.equal(due, true);
  assert.equal(dialogs(freeOrg, false, false, due), "resume");
  assert.equal(dialogs(freeOrg, true, false, due), "keep");
  assert.equal(dialogs(freeOrg, true, true, due), "announcement");
  assert.equal(
    dialogs(
      freeOrg,
      true,
      true,
      planAnnouncementDue({ ...preview, announcement: false }),
    ),
    null,
  );
  assert.equal(planAnnouncementDue({ ...preview, plan: "plus" }), false);
  assert.equal(planUsageMode(free), "current");
  assert.equal(planComposerMode(freeOrg), "limit");
});

test("the beta tester gift reaches card, popup, and hint while the summary carries it", () => {
  const gifted: PlanSummary = {
    ...free,
    usage: { percent: 90, used: 36, limit: 40 },
    announcement: true,
    plus: { ...free.plus, offer: { amount: 1000, currency: "USD" } },
  };
  const nearLimit: OrgBilling = {
    ...freeOrg,
    usage: {
      scope: "org",
      used: 36,
      limit: 40,
      resetsAt: "2026-10-01T00:00:00Z",
    },
  };
  assert.equal(planOffer(gifted, "en-US")?.amount, "$10");
  assert.equal(planComposerMode(nearLimit), "hint");
  assert.equal(planLaunchRefreshDelay(paidOrg, AFTER_LAUNCH), false);
  assert.equal(
    dialogs(paidOrg, true, true, planAnnouncementDue(gifted)),
    "announcement",
  );
  const ineligible: PlanSummary = {
    ...gifted,
    usage: free.usage,
    plus: { ...gifted.plus, offer: undefined },
    announcement: false,
  };
  assert.equal(planOffer(ineligible, "en-US"), null);
  assert.equal(planComposerMode(freeOrg), "limit");
  assert.equal(
    dialogs(paidOrg, true, true, planAnnouncementDue(ineligible)),
    null,
  );
});

test("offer copy carries no deadline or launch dates", () => {
  for (const language of ["en", "es", "pt"]) {
    const json = JSON.parse(
      readFileSync(
        new URL(`../src/locales/${language}/plan.json`, import.meta.url),
        "utf8",
      ),
    ) as Record<string, string>;
    for (const key of [
      "offerLead",
      "offerHint",
      "announcementGiftBody",
    ] as const)
      assert.doesNotMatch(json[key] ?? "", /\{\{(date|from|until)\}\}/);
    assert.equal(json.offerEnds, undefined);
  }
});

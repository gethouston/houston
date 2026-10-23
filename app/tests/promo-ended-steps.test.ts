import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { PromoEndedView } from "@houston/sdk";
import { JSDOM } from "jsdom";
import type { ReactElement } from "react";
import plan from "../src/locales/en/plan.json" with { type: "json" };
import teams from "../src/locales/en/teams.json" with { type: "json" };
import planEs from "../src/locales/es/plan.json" with { type: "json" };
import planPt from "../src/locales/pt/plan.json" with { type: "json" };

let h: typeof import("react").createElement;
let render: (element: ReactElement) => string;
let offer: typeof import("../src/components/shell/promo-ended-steps.tsx");
let answered: typeof import("../src/components/shell/promo-ended-answered.tsx");
let Dialog: typeof import("@houston-ai/core").Dialog;

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  render = (await import("react-dom/server")).renderToStaticMarkup;
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["plan", "teams"],
    defaultNS: "plan",
    resources: { en: { plan, teams } },
  });
  offer = await import("../src/components/shell/promo-ended-steps.tsx");
  answered = await import("../src/components/shell/promo-ended-answered.tsx");
  ({ Dialog } = await import("@houston-ai/core"));
});

const VIEW: PromoEndedView = {
  previousCents: 1500,
  nextCents: 2000,
  renewsAt: "2026-11-14T17:00:00Z",
  seats: 3,
  prices: { monthlyCents: 2000, annualCents: 18000 },
};
const noop = () => undefined;
const text = (element: ReactElement) =>
  new JSDOM(render(h(Dialog, { open: true }, element))).window.document.body
    .textContent ?? "";

describe("the promo-ended offer", () => {
  const shown = (patch: Record<string, unknown> = {}) =>
    text(
      h(offer.PromoOfferStep, {
        view: VIEW,
        org: "Acme",
        pick: "year",
        onPick: noop,
        pending: false,
        onConfirm: noop,
        onLater: noop,
        ...patch,
      }),
    );

  it("leads with yearly, charged today less this month's credit", () => {
    const body = shown();
    ok(body.includes("Your promotional price is ending"), body);
    ok(
      body.includes(
        "Acme pays a promotional $15 per member a month. From your next charge on November 14, it's $20. Switch to yearly to keep paying $15 a month.",
      ),
      body,
    );
    ok(body.indexOf("Yearly") < body.indexOf("Monthly"), "yearly comes first");
    ok(
      body.includes(
        "$540 a year for 3 members, charged today, less a credit for the unused part of this month.",
      ),
      body,
    );
    ok(body.includes("Switch to yearly"), body);
    ok(body.includes("Maybe later"), body);
  });

  it("names the monthly price on the action when monthly is picked", () => {
    const body = shown({ pick: "month" });
    ok(body.includes("$60 a month for 3 members, from November 14."), body);
    ok(body.includes("Continue monthly at $20"), body);
  });

  it("offers monthly alone where no yearly seat is sold", () => {
    const body = shown({
      pick: "month",
      view: { ...VIEW, prices: { monthlyCents: 2000, annualCents: null } },
    });
    strictEqual(body.includes("Yearly"), false, body);
    strictEqual(body.includes("Switch to yearly"), false, body);
    ok(body.includes("Continue monthly at $20"), body);
  });

  it("says it is switching while the switch is in flight", () => {
    ok(shown({ pending: true }).includes("Switching"));
  });
});

describe("the answered steps", () => {
  it("shows what the org pays after switching, off its billing", () => {
    const body = text(
      h(answered.PromoYearlyStep, {
        view: VIEW,
        org: "Acme",
        next: { totalCents: 54000, at: "2027-10-23T17:00:00Z" },
        onClose: noop,
      }),
    );
    for (const line of [
      "You're on yearly now",
      "Acme keeps paying $15 per member a month.",
      "PlanYearly",
      "Members3",
      "Next charge$540 on October 23",
      "You can change this in Settings, under Billing.",
      "Done",
    ])
      ok(body.includes(line), `${line} in ${body}`);
  });

  it("shows what the org pays from the next charge when staying monthly", () => {
    const body = text(
      h(answered.PromoMonthlyStep, { view: VIEW, org: "Acme", onClose: noop }),
    );
    ok(body.includes("You're staying on monthly"), body);
    ok(
      body.includes(
        "From November 14, Acme costs $20 per member a month, which is $60 a month for 3 members.",
      ),
      body,
    );
    ok(body.includes("Got it"), body);
    // The paid Billing tab has no switch to yearly, so nothing points there.
    strictEqual(body.includes("Settings"), false, body);
  });
});

describe("the promo-ended copy", () => {
  it("is mirrored in every language and never uses an em dash", () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "object" ? keys(v).map((s) => `${k}.${s}`) : [k],
      );
    deepStrictEqual(keys(planEs.promo), keys(plan.promo));
    deepStrictEqual(keys(planPt.promo), keys(plan.promo));
    for (const copy of [plan.promo, planEs.promo, planPt.promo])
      strictEqual(JSON.stringify(copy).includes("—"), false);
  });
});

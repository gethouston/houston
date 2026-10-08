import { equal, ok } from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { planOffer, planPriceAmounts } from "@houston/sdk";
import type { PlanSummary } from "@houston/wire-types";
import type { ReactElement } from "react";
import en from "../src/locales/en/plan.json" with { type: "json" };
import es from "../src/locales/es/plan.json" with { type: "json" };
import pt from "../src/locales/pt/plan.json" with { type: "json" };
import { enterNativeApp } from "./support/native-surface.ts";

// Store-safe payments, rendered: every purchase surface keeps today's look on
// desktop and in a browser tab, and inside the iOS/Android app shows no
// price, no checkout or portal button, and the managed-on-the-web line.

const free: PlanSummary = {
  plan: "free",
  announcement: false,
  usage: { percent: 100, used: 50, limit: 50 },
  plus: {
    status: "none",
    manageable: false,
    price: {
      amount: 1500,
      currency: "usd",
      interval: "month",
      compareAt: 2000,
    },
    offer: { amount: 100, currency: "usd" },
  },
};
const plus: PlanSummary = {
  plan: "plus",
  announcement: false,
  plus: {
    status: "active",
    renewsAt: "2026-11-08T12:00:00Z",
    manageable: true,
    price: { amount: 1500, currency: "usd", interval: "month" },
  },
};
const price = planPriceAmounts(free, "en");
const offer = planOffer(free, "en");

let render: (element: ReactElement) => string;
let markup: (element: ReactElement) => string;
let h: typeof import("react").createElement;
let surfaces: {
  PlanPrice: typeof import("../src/components/settings/sections/plan-price.tsx").PlanPrice;
  CurrentPlanCard: typeof import("../src/components/settings/sections/plan-current-card.tsx").CurrentPlanCard;
  UpgradeCard: typeof import("../src/components/settings/sections/billing-upgrade-card.tsx").UpgradeCard;
  PlanMessageLimitCard: typeof import("../src/components/shell/provider-error-cards/plan-limit.tsx").PlanMessageLimitCard;
  PlanWebNote: typeof import("../src/components/shell/plan-web-note.tsx").PlanWebNote;
};

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  const { renderToStaticMarkup } = await import("react-dom/server");
  markup = renderToStaticMarkup;
  render = (element) => text(renderToStaticMarkup(element));
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["plan"],
    defaultNS: "plan",
    resources: { en: { plan: en }, es: { plan: es }, pt: { plan: pt } },
  });
  surfaces = {
    ...(await import("../src/components/settings/sections/plan-price.tsx")),
    ...(await import(
      "../src/components/settings/sections/plan-current-card.tsx"
    )),
    ...(await import(
      "../src/components/settings/sections/billing-upgrade-card.tsx"
    )),
    ...(await import(
      "../src/components/shell/provider-error-cards/plan-limit.tsx"
    )),
    ...(await import("../src/components/shell/plan-web-note.tsx")),
  };
});

let leave: (() => void) | null = null;
afterEach(() => {
  leave?.();
  leave = null;
});
const native = () => {
  leave = enterNativeApp();
};
const noop = () => undefined;
const limitError = {
  kind: "plan_message_limit" as const,
  provider: "",
  resets_at: "",
  message: "",
};

describe("PlanPrice", () => {
  it("shows the price on desktop and in a browser tab", () => {
    ok(render(h(surfaces.PlanPrice, { plan: free })).includes(price.current));
  });

  it("shows nothing inside a store app", () => {
    native();
    equal(render(h(surfaces.PlanPrice, { plan: free })), "");
  });
});

describe("CurrentPlanCard", () => {
  const card = (plan: PlanSummary) =>
    render(
      h(surfaces.CurrentPlanCard, {
        plan,
        onManage: noop,
        managing: false,
        portalFallback: h("a", { href: "#" }, en.openPortal),
      }),
    );

  it("shows the price, Manage and the portal link off the store apps", () => {
    const html = card(plus);
    ok(html.includes(en.plus), html);
    ok(html.includes(price.current), html);
    ok(html.includes(en.manage), html);
    ok(html.includes(en.openPortal), html);
    equal(html.includes(en.managedOnWeb), false);
  });

  it("shows the plan and its state, but no price or portal, in a store app", () => {
    native();
    const html = card(plus);
    ok(html.includes(en.plus), html);
    ok(html.includes("Renews"), html);
    ok(html.includes(en.managedOnWeb), html);
    for (const sold of [price.current, en.manage, en.openPortal])
      equal(html.includes(sold), false, sold);
  });

  it("names the Free plan with the web line in a store app", () => {
    native();
    const html = card(free);
    ok(html.includes(en.freePlan), html);
    ok(html.includes(en.managedOnWeb), html);
  });
});

describe("UpgradeCard", () => {
  const card = () =>
    render(
      h(surfaces.UpgradeCard, {
        plan: free,
        onUpgrade: noop,
        upgrading: false,
        checkoutFallback: h("a", { href: "#" }, en.openCheckout),
      }),
    );

  it("offers Plus with its price and checkout off the store apps", () => {
    const html = card();
    ok(html.includes(en.upgradeTitle), html);
    ok(html.includes(price.current), html);
    ok(offer && html.includes(offer.amount), html);
    ok(html.includes(en.openCheckout), html);
  });

  it("is not drawn inside a store app", () => {
    native();
    equal(card(), "");
  });
});

describe("PlanMessageLimitCard", () => {
  const card = () =>
    render(h(surfaces.PlanMessageLimitCard, { error: limitError }));

  it("offers the upgrade off the store apps", () => {
    const html = card();
    ok(html.includes(en.limitTitle), html);
    ok(html.includes(en.limitBodyNoTime), html);
    ok(html.includes(en.upgrade), html);
  });

  it("says the limit and the web line, with no button, in a store app", () => {
    native();
    const html = card();
    ok(html.includes(en.limitTitle), html);
    ok(html.includes(en.native.limitBodyNoTime), html);
    equal(html.includes(en.upgrade), false, html);
    equal(
      markup(h(surfaces.PlanMessageLimitCard, { error: limitError })).includes(
        "<button",
      ),
      false,
    );
  });
});

describe("PlanWebNote", () => {
  it("is plain text, never a link or a button", () => {
    for (const variant of ["managed", "manage"] as const) {
      const html = markup(h(surfaces.PlanWebNote, { variant }));
      ok(html.startsWith("<p"), html);
      equal(/<a |<button/.test(html), false, html);
    }
  });

  it("names the website in en, es and pt", async () => {
    const i18next = (await import("i18next")).default;
    for (const [language, copy] of [
      ["en", en],
      ["es", es],
      ["pt", pt],
    ] as const) {
      await i18next.changeLanguage(language);
      const html = render(h(surfaces.PlanWebNote, { variant: "managed" }));
      ok(html.includes(copy.managedOnWeb), html);
      ok(html.includes("gethouston.ai"), html);
    }
    await i18next.changeLanguage("en");
  });
});

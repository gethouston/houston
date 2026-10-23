import { equal, ok } from "node:assert/strict";
import { afterEach, before, describe, it, mock } from "node:test";
import type { OrgBilling } from "@houston/wire-types";
import { createElement, type ReactElement, type ReactNode } from "react";
import enPlan from "../src/locales/en/plan.json" with { type: "json" };
import enTeams from "../src/locales/en/teams.json" with { type: "json" };
import esPlan from "../src/locales/es/plan.json" with { type: "json" };
import esTeams from "../src/locales/es/teams.json" with { type: "json" };
import ptPlan from "../src/locales/pt/plan.json" with { type: "json" };
import ptTeams from "../src/locales/pt/teams.json" with { type: "json" };
import { enterNativeApp } from "./support/native-surface.ts";

// Store-safe payments, rendered per reader: the billing owner gets the
// price, checkout and the portal on desktop and in a browser tab; everyone
// else is told to ask the owner; inside the iOS/Android app nobody sees a
// price, a checkout or portal button, or a push to upgrade.

let billing: OrgBilling | null = null;
const IDLE_CHECKOUT = {
  outstanding: false,
  orgSlug: null as string | null,
  fallbackUrl: null as string | null,
  succeeded: null as string | null,
};
let checkout = IDLE_CHECKOUT;

mock.module(
  new URL("../src/hooks/queries/use-billing.ts", import.meta.url).href,
  {
    namedExports: {
      useActiveOrgBilling: () => ({
        billing,
        orgSlug: "acme",
        isLoading: false,
      }),
      usePortal: () => ({
        isPending: false,
        mutate: () => {},
        fallbackUrl: null,
      }),
    },
  },
);
mock.module(
  new URL("../src/hooks/queries/use-org-checkout.ts", import.meta.url).href,
  {
    namedExports: {
      useOrgCheckout: () => ({
        start: () => {},
        resume: () => {},
        ...checkout,
      }),
    },
  },
);

mock.module(new URL("../src/lib/open-admin.ts", import.meta.url).href, {
  namedExports: { openAdmin: () => {} },
});
mock.module(
  new URL("../src/components/shell/fallback-link.tsx", import.meta.url).href,
  {
    namedExports: {
      FallbackLink: (props: { href: string; children?: ReactNode }) =>
        createElement("a", { href: props.href }, props.children),
    },
  },
);

function free(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    tier: "free",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: true,
    isBillingOwner: true,
    seats: 3,
    interval: null,
    seatPriceCents: 2000,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    usage: { scope: "org", used: 12, limit: 40, resetsAt: "" },
    routines: null,
    ...patch,
  };
}
const paid = (patch: Partial<OrgBilling> = {}) =>
  free({ tier: "paid", freeSlot: false, usage: null, ...patch });

let render: (element: ReactElement) => string;
let markup: (element: ReactElement) => string;
let h: typeof import("react").createElement;
let surfaces: {
  BillingPlanCard: typeof import("../src/components/organization/billing-plan-card.tsx").BillingPlanCard;
  BillingUsageCard: typeof import("../src/components/organization/billing-usage-card.tsx").BillingUsageCard;
  PlanMessageLimitCard: typeof import("../src/components/shell/provider-error-cards/plan-limit.tsx").PlanMessageLimitCard;
  PlanUpgradeRow: typeof import("../src/components/shell/plan-upgrade-row.tsx").PlanUpgradeRow;
  PlanWebNote: typeof import("../src/components/shell/plan-web-note.tsx").PlanWebNote;
};

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { TooltipProvider } = await import("@houston-ai/core");
  markup = (element) => renderToStaticMarkup(h(TooltipProvider, null, element));
  render = (element) => text(markup(element));
  const i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["plan", "teams"],
    defaultNS: "plan",
    resources: {
      en: { plan: enPlan, teams: enTeams },
      es: { plan: esPlan, teams: esTeams },
      pt: { plan: ptPlan, teams: ptTeams },
    },
  });
  surfaces = {
    ...(await import("../src/components/organization/billing-plan-card.tsx")),
    ...(await import("../src/components/organization/billing-usage-card.tsx")),
    ...(await import(
      "../src/components/shell/provider-error-cards/plan-limit.tsx"
    )),
    ...(await import("../src/components/shell/plan-upgrade-row.tsx")),
    ...(await import("../src/components/shell/plan-web-note.tsx")),
  };
});

let leave: (() => void) | null = null;
afterEach(() => {
  leave?.();
  leave = null;
  billing = null;
  checkout = IDLE_CHECKOUT;
});
const native = () => {
  leave = enterNativeApp();
};
const planCard = (value: OrgBilling) =>
  render(h(surfaces.BillingPlanCard, { billing: value, orgSlug: "acme" }));
const hasButton = (element: ReactElement) =>
  markup(element).includes("<button");

describe("BillingPlanCard", () => {
  it("offers the billing owner of a free org monthly or yearly, then Upgrade", () => {
    const element = h(surfaces.BillingPlanCard, {
      billing: free(),
      orgSlug: "acme",
    });
    const html = text(markup(element));
    ok(html.includes(enTeams.billing.planFree), html);
    ok(html.includes("Monthly $20 per member a month"), html);
    ok(
      html.includes(
        "Yearly $15 per member a month, billed yearly, $180 a year",
      ),
      html,
    );
    // Monthly is preselected, so the total under the choice is a month's.
    ok(html.includes("$60 a month for 3 members"), html);
    ok(/checked="" value="month"/.test(markup(element)), markup(element));
    ok(html.includes(enTeams.billing.upgrade), html);
  });

  it("offers monthly alone, with the price per member, where yearly is not sold", () => {
    const element = h(surfaces.BillingPlanCard, {
      billing: free({ seatPrices: { monthlyCents: 2000, annualCents: null } }),
      orgSlug: "acme",
    });
    const html = text(markup(element));
    ok(
      html.includes("$20 per member a month, $60 a month for 3 members"),
      html,
    );
    equal(markup(element).includes('role="radiogroup"'), false, html);
  });

  it("shows the billing owner of a paid org its seats, total and Manage billing", () => {
    const html = planCard(paid({ interval: "month" }));
    ok(html.includes(enTeams.billing.planPaid), html);
    ok(html.includes("3 seats, $60 a month"), html);
    ok(html.includes(enTeams.billing.manage), html);
  });

  it("bills a yearly org per year and a moved payer at their own price", () => {
    ok(
      planCard(paid({ interval: "year", seatPriceCents: 18000 })).includes(
        "3 seats, $540 a year",
      ),
    );
    ok(
      planCard(paid({ interval: "month", seatPriceCents: 1500 })).includes(
        "3 seats, $45 a month",
      ),
    );
  });

  it("shows a seat grace's price today and the later total, per interval", () => {
    const grace = "2099-11-20T12:00:00Z";
    const html = planCard(paid({ interval: "month", seatGraceEndsAt: grace }));
    ok(/\$20 a month until .+2099, then \$60 a month/.test(html), html);
    const yearly = planCard(
      paid({ interval: "year", seatPriceCents: 18000, seatGraceEndsAt: grace }),
    );
    ok(/\$180 a year until .+2099, then \$540 a year/.test(yearly), yearly);
  });

  it("shows another owner or admin the state and seats, and who to ask", () => {
    for (const value of [free(), paid()]) {
      const element = h(surfaces.BillingPlanCard, {
        billing: { ...value, isBillingOwner: false },
        orgSlug: "acme",
      });
      const html = text(markup(element));
      ok(html.includes(enTeams.billing.askOwner), html);
      equal(hasButton(element), false, html);
    }
    ok(planCard(paid({ isBillingOwner: false })).includes("3 seats"));
  });

  it("offers a blocked checkout's link only on the org it pays for", () => {
    checkout = {
      outstanding: true,
      orgSlug: "other",
      fallbackUrl: "https://checkout.stripe.com/c/other",
      succeeded: null,
    };
    equal(planCard(free()).includes(enTeams.billing.openCheckout), false);
    checkout = { ...checkout, orgSlug: "acme" };
    ok(planCard(free()).includes(enTeams.billing.openCheckout));
  });

  it("tells every reader of a free org how many members share it", () => {
    ok(planCard(free()).includes("3 members share one weekly allowance"));
    ok(
      planCard(free({ isBillingOwner: false })).includes(
        "3 members share one weekly allowance",
      ),
    );
  });

  it("draws no price and no button inside a store app", () => {
    native();
    for (const value of [free(), paid(), paid({ isBillingOwner: false })]) {
      const element = h(surfaces.BillingPlanCard, {
        billing: value,
        orgSlug: "acme",
      });
      const html = text(markup(element));
      equal(html.includes("$"), false, html);
      equal(hasButton(element), false, html);
    }
    ok(planCard(free()).includes(enPlan.managedOnWeb));
    ok(planCard(paid()).includes("3 seats"));
    ok(
      planCard(paid({ isBillingOwner: false })).includes(
        enTeams.native.askOwner,
      ),
    );
  });
});

describe("BillingUsageCard", () => {
  it("shows the pool as a share of the week, never a message count", () => {
    const html = render(h(surfaces.BillingUsageCard, { billing: free() }));
    ok(html.includes("30% used"), html);
    equal(/\b(12|40)\b/.test(html), false, html);
  });
});

describe("PlanMessageLimitCard", () => {
  const error = {
    kind: "plan_message_limit" as const,
    provider: "",
    resets_at: "",
    message: "",
    scope: "org" as const,
  };
  const card = () => h(surfaces.PlanMessageLimitCard, { error });

  it("offers the billing owner the upgrade off the store apps", () => {
    billing = free();
    const html = render(card());
    ok(html.includes(enPlan.limitBodyNoTime), html);
    ok(hasButton(card()), html);
  });

  it("tells everyone else to ask the owner, with no button", () => {
    billing = free({ isBillingOwner: false });
    const html = render(card());
    ok(html.includes(enPlan.limitBodyMemberNoTime), html);
    equal(hasButton(card()), false, html);
  });

  it("only says when a paid seat's own allowance resets", () => {
    billing = paid();
    const html = render(
      h(surfaces.PlanMessageLimitCard, { error: { ...error, scope: "seat" } }),
    );
    ok(html.includes(enPlan.limitBodyResetOnlyNoTime), html);
  });

  it("offers no upgrade where the org's billing is not a free org's", () => {
    for (const value of [paid(), null]) {
      billing = value;
      ok(render(card()).includes(enPlan.limitBodyResetOnlyNoTime));
      equal(hasButton(card()), false);
    }
  });

  it("never sends anyone to upgrade inside a store app", () => {
    native();
    billing = free();
    ok(render(card()).includes(enPlan.native.limitBodyNoTime));
    equal(hasButton(card()), false);
    billing = free({ isBillingOwner: false });
    ok(render(card()).includes(enPlan.native.limitBodyMemberNoTime));
    equal(hasButton(card()), false);
  });
});

describe("PlanUpgradeRow", () => {
  const row = () => h(surfaces.PlanUpgradeRow, {});
  const near = { used: 34, limit: 40 };
  const atUsage = (patch: Partial<OrgBilling>, used = near) =>
    free({
      usage: { scope: "org", ...used, resetsAt: "" },
      ...patch,
    });

  it("is the billing owner's Upgrade button", () => {
    billing = free();
    const html = markup(row());
    ok(html.includes("<button"), html);
    ok(text(html).includes(enPlan.sidebar.upgrade), html);
  });

  it("is a status line with who to ask for everyone else, from 80%", () => {
    billing = atUsage({ isBillingOwner: false });
    const html = markup(row());
    equal(html.includes("<button"), false, html);
    ok(html.includes('role="status"'), html);
    ok(text(html).includes(enPlan.sidebar.askOwner), html);
    billing = free({ isBillingOwner: false });
    equal(markup(row()), "");
  });

  it("never asks anyone to upgrade inside a store app", () => {
    native();
    billing = atUsage({ isBillingOwner: false });
    const html = text(markup(row()));
    ok(html.includes("85% used"), html);
    equal(html.includes(enPlan.sidebar.askOwner), false, html);
    billing = free();
    equal(markup(row()), "");
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
      ["en", enPlan],
      ["es", esPlan],
      ["pt", ptPlan],
    ] as const) {
      await i18next.changeLanguage(language);
      const html = render(h(surfaces.PlanWebNote, { variant: "managed" }));
      ok(html.includes(copy.managedOnWeb), html);
      ok(html.includes("gethouston.ai"), html);
    }
    await i18next.changeLanguage("en");
  });
});

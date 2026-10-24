import { ok, strictEqual } from "node:assert";
import { before, describe, it } from "node:test";
import type { OrgBilling } from "@houston/engine-adapter";
import type { ReactElement } from "react";
import teams from "../src/locales/en/teams.json" with { type: "json" };
import teamsEs from "../src/locales/es/teams.json" with { type: "json" };
import teamsPt from "../src/locales/pt/teams.json" with { type: "json" };

let h: typeof import("react").createElement;
let render: (element: ReactElement) => string;
let i18next: typeof import("i18next").default;
let line: typeof import("../src/components/organization/billing-next-adjustment.tsx");

before(async () => {
  const React = await import("react");
  Object.assign(globalThis, { React });
  h = React.createElement;
  render = (await import("react-dom/server")).renderToStaticMarkup;
  i18next = (await import("i18next")).default;
  const { initReactI18next } = await import("react-i18next");
  await i18next.use(initReactI18next).init({
    lng: "en",
    ns: ["teams"],
    defaultNS: "teams",
    resources: {
      en: { teams },
      es: { teams: teamsEs },
      pt: { teams: teamsPt },
    },
  });
  line = await import(
    "../src/components/organization/billing-next-adjustment.tsx"
  );
});

const NOW = Date.parse("2026-10-24T15:00:00Z");

function yearly(patch: Partial<OrgBilling> = {}): OrgBilling {
  return {
    tier: "paid",
    status: "active",
    lockAt: null,
    lockReason: null,
    freeSlot: false,
    isBillingOwner: true,
    seats: 2,
    interval: "year",
    seatPriceCents: 18000,
    seatPrices: { monthlyCents: 2000, annualCents: 18000 },
    seatGraceEndsAt: null,
    renewsAt: "2027-10-24T14:19:10Z",
    priceNotice: null,
    nextAdjustment: {
      kind: "charge",
      amountCents: 18000,
      at: "2026-11-24T14:19:10Z",
    },
    usage: null,
    routines: null,
    ...patch,
  };
}

const draw = (billing: OrgBilling) =>
  render(h(line.BillingNextAdjustment, { billing, now: NOW }));

describe("BillingNextAdjustment", () => {
  it("names a yearly owner's next charge and why", async () => {
    await i18next.changeLanguage("en");
    const html = draw(yearly());
    ok(html.includes('data-kind="charge"'), html);
    ok(html.includes("Next adjustment: $180"), html);
    ok(html.includes("Members added mid-year"), html);
  });

  it("names a credit as a credit on the next invoice", async () => {
    await i18next.changeLanguage("en");
    const html = draw(
      yearly({
        nextAdjustment: {
          kind: "credit",
          amountCents: 4500,
          at: "2026-11-24T14:19:10Z",
        },
      }),
    );
    ok(html.includes('data-kind="credit"'), html);
    ok(html.includes("Credit of $45 on your next invoice"), html);
  });

  it("draws nothing with nothing pending, for a monthly org or another reader", () => {
    strictEqual(draw(yearly({ nextAdjustment: null })), "");
    strictEqual(draw(yearly({ interval: "month" })), "");
    strictEqual(draw(yearly({ isBillingOwner: false })), "");
  });

  it("speaks Spanish and Portuguese", async () => {
    await i18next.changeLanguage("es");
    ok(draw(yearly()).includes("Próximo ajuste:"));
    await i18next.changeLanguage("pt");
    ok(draw(yearly()).includes("Próximo ajuste:"));
    await i18next.changeLanguage("en");
  });
});

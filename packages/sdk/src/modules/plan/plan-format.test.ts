import type { PlanSummary } from "@houston/wire-types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planAnnouncementView } from "./announcement-model";
import { planOffer } from "./billing-model";
import {
  formatLaunchDate,
  formatLocalDate,
  formatLocalDateTime,
  formatPlanAmount,
} from "./format";

/** Intl separates a currency code from the number with a no-break space. */
const plain = (value: string) => value.replace(/\u00a0/g, " ");

const BEFORE_LAUNCH = Date.parse("2026-09-25T00:00:00Z");
const launch: PlanSummary = {
  plan: "free",
  announcement: true,
  limitsStartAt: "2026-10-01T07:00:00Z",
  usage: { percent: 10, used: 4, limit: 40 },
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "usd", interval: "month" },
    offer: {
      amount: 1000,
      currency: "usd",
      coversFrom: "2026-10-01T07:00:00Z",
      coversUntil: "2026-11-01T07:00:00Z",
      endsAt: "2026-10-01T06:28:00Z",
    },
  },
};

describe("launch instants read as San Francisco dates in every zone", () => {
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Pacific/Honolulu";
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  it("runs in a zone where the launch instant is still September 30", () => {
    expect(
      new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
      }).format(new Date("2026-10-01T07:00:00Z")),
    ).toBe("September 30");
  });

  it("shows October 1 in the announcement title and gift", () => {
    const view = planAnnouncementView(launch, "en-US", BEFORE_LAUNCH);
    expect(view.starts).toBe("October 1");
    expect(view.offer?.from).toBe("October 1");
    expect(view.offer?.until).toBe("November 1");
  });

  it("shows October 1 in the offer lead and September 30 as the offer end", () => {
    expect(planOffer(launch, "en-US", BEFORE_LAUNCH)).toMatchObject({
      from: "Oct 1, 2026",
      until: "Nov 1, 2026",
      ends: "Sep 30, 2026",
    });
    expect(formatLaunchDate("2026-10-01T07:00:00Z", "en-US")).toBe(
      "Oct 1, 2026",
    );
  });
});

describe("renewal and reset instants follow the app language", () => {
  it("formats in the given locale, not the OS locale", () => {
    expect(formatLocalDate("2026-10-15T12:00:00Z", "es")).toMatch(/oct/);
    expect(formatLocalDateTime("2026-10-15T12:00:00Z", "pt")).toMatch(/out/);
  });
});

describe("minor units follow Stripe's currency decimals", () => {
  it("never shows a two-decimal Stripe currency 100 times too large", () => {
    expect(plain(formatPlanAmount(150_000, "isk", "en-US"))).toBe("ISK 1,500");
    expect(plain(formatPlanAmount(150_000, "huf", "en-US"))).toBe("HUF 1,500");
    expect(plain(formatPlanAmount(150_000, "idr", "en-US"))).toBe("IDR 1,500");
    expect(plain(formatPlanAmount(150_000, "twd", "en-US"))).toBe("NT$1,500");
  });

  it("keeps zero- and three-decimal currencies exact", () => {
    expect(plain(formatPlanAmount(1500, "jpy", "en-US"))).toBe("¥1,500");
    expect(plain(formatPlanAmount(1500, "krw", "en-US"))).toBe("₩1,500");
    expect(plain(formatPlanAmount(15_500, "bhd", "en-US"))).toBe("BHD 15.500");
    expect(plain(formatPlanAmount(1499, "usd", "en-US"))).toBe("$14.99");
    expect(plain(formatPlanAmount(1500, "usd", "en-US"))).toBe("$15");
  });
});

import { describe, expect, it } from "vitest";
import { seatCheckoutRequestSchema } from "./seat-prices";

describe("seatCheckoutRequestSchema", () => {
  it("takes a monthly or yearly interval, or none", () => {
    expect(seatCheckoutRequestSchema.parse({ interval: "year" })).toEqual({
      interval: "year",
    });
    expect(seatCheckoutRequestSchema.parse({})).toEqual({});
  });

  it("refuses an interval it does not sell", () => {
    expect(
      seatCheckoutRequestSchema.safeParse({ interval: "week" }).success,
    ).toBe(false);
  });
});

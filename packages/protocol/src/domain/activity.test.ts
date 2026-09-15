import { describe, expect, test } from "vitest";
import { activityUpdateSchema } from "./activity";

describe("activityUpdateSchema", () => {
  test("accepts null provider/model as explicit clears", () => {
    expect(activityUpdateSchema.parse({ provider: null, model: null })).toEqual(
      { provider: null, model: null },
    );
  });

  test("a title that is only spaces is not a rename", () => {
    // A mission's card shows its title and nothing else, so an empty one leaves
    // a blank card with no way back to what it was called. The app trims before
    // it sends; this is the same rule for every other writer, the agent's own
    // tools included.
    expect(activityUpdateSchema.safeParse({ title: "   " }).success).toBe(
      false,
    );
    expect(activityUpdateSchema.safeParse({ title: "" }).success).toBe(false);
    expect(activityUpdateSchema.parse({ title: "  Deck  " })).toEqual({
      title: "Deck",
    });
  });

  test("rejects invalid pin values and unknown fields", () => {
    expect(activityUpdateSchema.safeParse({ provider: 3 }).success).toBe(false);
    expect(activityUpdateSchema.safeParse({ surprise: true }).success).toBe(
      false,
    );
  });
});

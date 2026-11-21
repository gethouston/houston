import { describe, expect, test } from "vitest";
import { activityUpdateSchema } from "./activity";

describe("activityUpdateSchema", () => {
  test("accepts null provider/model as explicit clears", () => {
    expect(activityUpdateSchema.parse({ provider: null, model: null })).toEqual(
      { provider: null, model: null },
    );
  });

  test("a title that is only spaces is not a rename", () => {
    expect(activityUpdateSchema.safeParse({ title: "   " }).success).toBe(
      false,
    );
    expect(activityUpdateSchema.safeParse({ title: "" }).success).toBe(false);
    expect(activityUpdateSchema.parse({ title: "  Deck  " })).toEqual({
      title: "Deck",
    });
  });

  test("keeps a conversation's mode, and only a known one", () => {
    expect(activityUpdateSchema.parse({ mode: "auto" })).toEqual({
      mode: "auto",
    });
    expect(activityUpdateSchema.safeParse({ mode: null }).success).toBe(false);
    expect(activityUpdateSchema.safeParse({ mode: "autopilot" }).success).toBe(
      false,
    );
  });

  test("rejects invalid pin values and unknown fields", () => {
    expect(activityUpdateSchema.safeParse({ provider: 3 }).success).toBe(false);
    expect(activityUpdateSchema.safeParse({ surprise: true }).success).toBe(
      false,
    );
  });
});

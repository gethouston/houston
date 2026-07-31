import { describe, expect, test } from "vitest";
import { activityUpdateSchema } from "./activity";

describe("activityUpdateSchema", () => {
  test("accepts null provider/model as explicit clears", () => {
    expect(activityUpdateSchema.parse({ provider: null, model: null })).toEqual(
      { provider: null, model: null },
    );
  });

  test("rejects invalid pin values and unknown fields", () => {
    expect(activityUpdateSchema.safeParse({ provider: 3 }).success).toBe(false);
    expect(activityUpdateSchema.safeParse({ surprise: true }).success).toBe(
      false,
    );
  });
});

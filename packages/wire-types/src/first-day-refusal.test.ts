import { describe, expect, it } from "vitest";
import {
  parseFirstDayRefusal,
  parseFirstDayRefusalText,
} from "./first-day-refusal";

describe("parseFirstDayRefusal", () => {
  it.each(["first_day_not_pending", "first_day_not_started"])(
    "reads the %s refusal",
    (code) => {
      expect(parseFirstDayRefusal({ code, error: "refused" })).toEqual({
        code,
        error: "refused",
      });
    },
  );

  it("reads the no-provider refusal and the provider it names", () => {
    expect(
      parseFirstDayRefusal({
        code: "first_day_no_provider",
        error: "No provider connected for anthropic. Connect it first.",
        provider: "anthropic",
      }),
    ).toEqual({
      code: "first_day_no_provider",
      error: "No provider connected for anthropic. Connect it first.",
      provider: "anthropic",
    });
    expect(
      parseFirstDayRefusal({ code: "first_day_no_provider", error: "x" }),
    ).toEqual({ code: "first_day_no_provider", error: "x" });
  });

  it("keeps a provider only on the no-provider refusal", () => {
    expect(
      parseFirstDayRefusal({
        code: "first_day_not_started",
        error: "x",
        provider: "anthropic",
      }),
    ).toEqual({ code: "first_day_not_started", error: "x" });
  });

  it("is null for any other body", () => {
    expect(
      parseFirstDayRefusal({ code: "no_provider", error: "x" }),
    ).toBeNull();
    expect(parseFirstDayRefusal({ code: "first_day_no_provider" })).toBeNull();
    expect(parseFirstDayRefusal("first_day_no_provider")).toBeNull();
    expect(parseFirstDayRefusal(null)).toBeNull();
  });

  it("parses raw text, null when it is not JSON", () => {
    expect(
      parseFirstDayRefusalText(
        '{"code":"first_day_no_provider","error":"No provider connected."}',
      ),
    ).toEqual({
      code: "first_day_no_provider",
      error: "No provider connected.",
    });
    expect(parseFirstDayRefusalText("<html>")).toBeNull();
  });
});

import { expect, test } from "vitest";
import {
  filePreviewRefusalCodeSchema,
  officePreviewCapabilitiesSchema,
  parseFilePreviewRefusal,
} from "./file-preview";

test("preview refusals require a known code and a sentence", () => {
  for (const code of filePreviewRefusalCodeSchema.options) {
    expect(parseFilePreviewRefusal({ code, error: "refused" })).toEqual({
      code,
      error: "refused",
    });
  }
  expect(
    parseFilePreviewRefusal({ code: "unknown", error: "refused" }),
  ).toBeNull();
  expect(parseFilePreviewRefusal({ code: "timeout" })).toBeNull();
  expect(parseFilePreviewRefusal(null)).toBeNull();
});

test("absent Office capability parses as false", () => {
  expect(officePreviewCapabilitiesSchema.parse({ profile: "cloud" })).toEqual({
    officePreview: false,
  });
  for (const officePreview of [true, false]) {
    expect(officePreviewCapabilitiesSchema.parse({ officePreview })).toEqual({
      officePreview,
    });
  }
  expect(
    officePreviewCapabilitiesSchema.safeParse({ officePreview: "true" })
      .success,
  ).toBe(false);
});

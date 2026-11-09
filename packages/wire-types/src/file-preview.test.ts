import { expect, test } from "vitest";
import {
  filePreviewRefusalCodeSchema,
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

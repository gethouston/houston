import { FilePreviewError, OFFICE_EXTENSIONS } from "@houston/wire-types";
import { expect, test } from "vitest";
import { previewPlan, previewRefusalAction } from "./preview";

test("only configured Office previews request a PDF", () => {
  for (const ext of OFFICE_EXTENSIONS) {
    expect(
      previewPlan(`file.${ext.toUpperCase()}`, { officePreview: true }),
    ).toBe("pdf");
    expect(previewPlan(`file.${ext}`, { officePreview: false })).toBe("bytes");
  }
  expect(previewPlan("file.pptx", null)).toBe("bytes");
  expect(previewPlan("file.pptx", {})).toBe("bytes");
  for (const name of ["file.pdf", "file.md", "file.png", "file.zip", "pptx"]) {
    expect(previewPlan(name, { officePreview: true })).toBe("bytes");
  }
});
test("all refusals fall back, and failed conversions get reported", () => {
  for (const code of ["timeout", "conversion_failed"] as const)
    expect(previewRefusalAction(new FilePreviewError(code, "failed"))).toBe(
      "report-and-fallback",
    );
  for (const code of [
    "unsupported_type",
    "too_large",
    "conversion_unavailable",
  ] as const)
    expect(previewRefusalAction(new FilePreviewError(code, "refused"))).toBe(
      "fallback",
    );
  expect(previewRefusalAction(new Error("unrelated"))).toBeNull();
});

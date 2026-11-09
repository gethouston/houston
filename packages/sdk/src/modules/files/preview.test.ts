import { FilePreviewError, OFFICE_EXTENSIONS } from "@houston/wire-types";
import { expect, test } from "vitest";
import { classifyPreviewRefusal, previewPlan } from "./preview";

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
test("preview failures always fall back, and only expected refusals remain silent", () => {
  for (const code of [
    "timeout",
    "conversion_failed",
    "conversion_unavailable",
  ] as const) {
    expect(
      classifyPreviewRefusal(new FilePreviewError(code, "failed"), {
        officePreview: true,
      }),
    ).toMatchObject({
      fallback: true,
      report: true,
      error: { name: "FilePreviewError" },
    });
  }
  for (const code of ["unsupported_type", "too_large"] as const) {
    expect(
      classifyPreviewRefusal(new FilePreviewError(code, "refused"), {
        officePreview: true,
      }),
    ).toEqual({ fallback: true, report: false });
  }
  expect(
    classifyPreviewRefusal(
      new FilePreviewError("conversion_unavailable", "off"),
      { officePreview: false },
    ),
  ).toEqual({ fallback: true, report: false });
  expect(
    classifyPreviewRefusal(new Error("transport failed"), {
      officePreview: true,
    }),
  ).toMatchObject({
    fallback: true,
    report: true,
    error: { name: "FilePreviewError" },
  });
});

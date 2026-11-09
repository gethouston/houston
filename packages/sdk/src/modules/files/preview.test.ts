import {
  FilePreviewError,
  OFFICE_EXTENSIONS,
  officePreviewCapabilitiesSchema,
} from "@houston/wire-types";
import { expect, test, vi } from "vitest";
import { classifyPreviewRefusal, loadPreview, previewPlan } from "./preview";

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
    ).toEqual({ fallback: true, report: false, retryable: false });
  }
  expect(
    classifyPreviewRefusal(
      new FilePreviewError("conversion_unavailable", "off"),
      { officePreview: false },
    ),
  ).toEqual({ fallback: true, report: false, retryable: false });
  for (const error of [
    new TypeError("fetch failed"),
    Object.assign(new Error("file not found"), { status: 404 }),
  ]) {
    const result = classifyPreviewRefusal(error, { officePreview: true });
    expect(result).toEqual({ fallback: false, error });
    if (!result.fallback) expect(result.error).toBe(error);
  }
});

test("parsed capabilities without Office preview keep the bytes plan", () => {
  const capabilities = officePreviewCapabilitiesSchema.parse(
    JSON.parse('{"profile":"cloud"}'),
  );
  expect(capabilities.officePreview).toBe(false);
  expect(previewPlan("deck.pptx", capabilities)).toBe("bytes");
});

function clock() {
  let now = 0;
  const delays: number[] = [];
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      delays.push(ms);
      now += ms;
      fn();
      return 0;
    },
    clearTimeout: () => {},
    delays,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

test("capacity refusals are retryable and quiet", () => {
  const error = new FilePreviewError("conversion_unavailable", "busy", 2000);
  expect(classifyPreviewRefusal(error, { officePreview: true })).toEqual({
    fallback: true,
    report: true,
    retryable: true,
    quiet: "office_preview_capacity",
    error,
  });
  expect(
    classifyPreviewRefusal(
      new FilePreviewError("conversion_unavailable", "down"),
      { officePreview: true },
    ),
  ).toMatchObject({
    report: true,
    retryable: false,
    quiet: null,
  });
});

test("capacity waits honor Retry-After and stop after two retries", async () => {
  const time = clock();
  const error = new FilePreviewError("conversion_unavailable", "busy", 2000);
  const download = vi.fn().mockRejectedValue(error);
  await expect(loadPreview(download, time)).rejects.toBe(error);
  expect(download).toHaveBeenCalledTimes(3);
  expect(time.delays).toEqual([2000, 2000]);
});

test("a capacity retry can succeed", async () => {
  const time = clock();
  const pdf = new Blob(["%PDF"]);
  const download = vi
    .fn()
    .mockRejectedValueOnce(
      new FilePreviewError("conversion_unavailable", "busy", 2000),
    )
    .mockResolvedValue(pdf);
  await expect(loadPreview(download, time)).resolves.toBe(pdf);
  expect(time.delays).toEqual([2000]);
});

test("capacity retries never shorten the server wait to fit the five-second budget", async () => {
  for (const hint of [3000, 6000]) {
    const time = clock();
    const error = new FilePreviewError("conversion_unavailable", "busy", hint);
    const download = vi.fn().mockRejectedValue(error);
    await expect(loadPreview(download, time)).rejects.toBe(error);
    expect(time.delays).toEqual(hint === 3000 ? [3000] : []);
    expect(time.now()).toBeLessThanOrEqual(5000);
  }
});

test("time spent in requests counts against the capacity budget", async () => {
  const time = clock();
  const error = new FilePreviewError("conversion_unavailable", "busy", 2000);
  const download = vi.fn(async () => {
    time.advance(2000);
    throw error;
  });
  await expect(loadPreview(download, time)).rejects.toBe(error);
  expect(download).toHaveBeenCalledTimes(2);
  expect(time.delays).toEqual([2000]);
});

test("non-capacity failures retain identity and do not retry", async () => {
  for (const error of [
    new FilePreviewError("conversion_unavailable", "down"),
    new FilePreviewError("conversion_failed", "bad file"),
    new TypeError("fetch failed"),
    Object.assign(new Error("file not found"), { status: 404 }),
  ]) {
    const time = clock();
    const download = vi.fn().mockRejectedValue(error);
    await expect(loadPreview(download, time)).rejects.toBe(error);
    expect(download).toHaveBeenCalledTimes(1);
    expect(time.delays).toEqual([]);
  }
});

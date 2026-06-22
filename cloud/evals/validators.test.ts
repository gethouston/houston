import { test, expect } from "bun:test";
import JSZip from "jszip";
import { validatePng, validatePptx, validateXlsx } from "./validators";

/**
 * The validators are the eval harness's measuring stick — they must accept a
 * structurally-sound artifact and reject garbage, or every nightly score is
 * noise.
 */

async function zipOf(entries: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries))
    zip.file(path, content);
  return zip.generateAsync({ type: "uint8array" });
}

test("validatePptx passes a minimal real deck and counts slides", async () => {
  const bytes = await zipOf({
    "[Content_Types].xml": "<Types/>",
    "ppt/presentation.xml": "<p:presentation/>",
    "ppt/slides/slide1.xml": "<p:sld/>",
    "ppt/slides/slide2.xml": "<p:sld/>",
    "ppt/slides/slide3.xml": "<p:sld/>",
    "ppt/slides/slide4.xml": "<p:sld/>",
  });
  const checks = await validatePptx(bytes, { minSlides: 4 });
  expect(checks.every((c) => c.pass)).toBe(true);
});

test("validatePptx fails on too few slides and on non-zip bytes", async () => {
  const few = await zipOf({
    "[Content_Types].xml": "<Types/>",
    "ppt/presentation.xml": "<p:presentation/>",
    "ppt/slides/slide1.xml": "<p:sld/>",
  });
  const checks = await validatePptx(few, { minSlides: 4 });
  const slidesCheck = checks.find((c) => c.name.includes("slides"));
  if (!slidesCheck) throw new Error("slides check not found");
  expect(slidesCheck.pass).toBe(false);

  const garbage = await validatePptx(new TextEncoder().encode("not a zip"), {
    minSlides: 4,
  });
  const zipCheck = garbage.find((c) => c.name === "valid zip container");
  if (!zipCheck) throw new Error("valid zip container check not found");
  expect(zipCheck.pass).toBe(false);
});

test("validateXlsx checks workbook skeleton and data rows", async () => {
  const good = await zipOf({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": "<workbook/>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><row r="1"/><row r="2"/><row r="3"/></worksheet>',
  });
  expect((await validateXlsx(good)).every((c) => c.pass)).toBe(true);

  const empty = await zipOf({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": "<workbook/>",
    "xl/worksheets/sheet1.xml": "<worksheet/>",
  });
  const checks = await validateXlsx(empty);
  const dataRowsCheck = checks.find(
    (c) => c.name === "worksheet has data rows",
  );
  if (!dataRowsCheck)
    throw new Error("worksheet has data rows check not found");
  expect(dataRowsCheck.pass).toBe(false);
});

test("validatePng checks magic header and minimum size", async () => {
  const png = new Uint8Array(6000);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  expect(
    (await validatePng(png, { minBytes: 5000 })).every((c) => c.pass),
  ).toBe(true);

  const tiny = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
  ]);
  const checks = await validatePng(tiny, { minBytes: 5000 });
  const sizeCheck = checks.find((c) => c.name.includes("at least"));
  if (!sizeCheck) throw new Error("size check not found");
  expect(sizeCheck.pass).toBe(false);

  const notPng = new TextEncoder().encode("JFIF....");
  const magicCheck = (await validatePng(notPng, { minBytes: 1 })).find(
    (c) => c.name === "PNG magic header",
  );
  if (!magicCheck) throw new Error("PNG magic header check not found");
  expect(magicCheck.pass).toBe(false);
});

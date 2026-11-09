import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

const base = process.env.OFFICE_CONVERT_TEST_URL;
test.skipIf(!base)(
  "LibreOffice converts a real workbook to one PDF page per sheet",
  async () => {
    const source = await readFile(
      new URL("../fixtures/sheets.xlsx", import.meta.url),
    );
    const response = await fetch(`${base}/convert?ext=xlsx&lang=es-CO`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(source),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-page-count")).toBe("1");
    expect(response.headers.get("x-converter-version")).toBeTruthy();
    expect(
      Buffer.from(await response.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
  },
);

test.skipIf(!base)(
  "LibreOffice producing no PDF is a conversion_failed refusal",
  async () => {
    const response = await fetch(`${base}/convert?ext=pptx&lang=en`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ code: "conversion_failed" });
  },
);

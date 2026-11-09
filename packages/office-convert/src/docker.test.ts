import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

const base = process.env.OFFICE_CONVERT_TEST_URL;
const container = process.env.OFFICE_CONVERT_TEST_CONTAINER;

async function convert(
  ext: "xlsx" | "pptx" | "odp",
  source: Uint8Array,
): Promise<unknown> {
  // Internal-only compose networks accept requests through docker exec.
  if (container) {
    const result = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "bun",
        "-e",
        `const response = await fetch("http://127.0.0.1:8080/convert?ext=${ext}&lang=es-CO", {
        method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: await Bun.stdin.bytes(),
      });
      console.log(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }));`,
      ],
      { input: source, encoding: "utf8", timeout: 40_000 },
    );
    return JSON.parse(result);
  }
  const response = await fetch(`${base}/convert?ext=${ext}&lang=es-CO`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(source),
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: await response.text(),
  };
}

test.skipIf(!base && !container)(
  "LibreOffice converts a real workbook to one PDF page per sheet",
  async () => {
    const source = await readFile(
      new URL("../fixtures/sheets.xlsx", import.meta.url),
    );
    expect(await convert("xlsx", source)).toMatchObject({
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "x-page-count": "1",
        "x-converter-version": expect.any(String),
      },
      body: expect.stringMatching(/^%PDF-/),
    });
  },
);

test.skipIf(!base && !container)(
  "LibreOffice producing no PDF is a conversion_failed refusal",
  async () => {
    expect(
      await convert("pptx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])),
    ).toMatchObject({
      status: 422,
      body: JSON.stringify({ code: "conversion_failed" }),
    });
  },
);

test.skipIf(!base && !container)(
  "LibreOffice streams a real deck without Content-Length",
  async () => {
    const source = await readFile(
      new URL("../fixtures/deck.odp", import.meta.url),
    );
    const result = await convert("odp", source);
    expect(result).toMatchObject({
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "transfer-encoding": "chunked",
        "x-page-count": "2",
        "x-converter-version": expect.any(String),
      },
      body: expect.stringMatching(/^%PDF-/),
    });
    expect(result).not.toHaveProperty("headers.content-length");
  },
);

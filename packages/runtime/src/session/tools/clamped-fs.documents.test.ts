import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  pdfWithPages,
  readDocument,
  spanishSentence,
} from "./document-fixtures.test-helpers";

let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "houston-read-documents-"));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

test.each([
  "attachment.pdf",
  "renamed.bin",
])("extracts accented PDF text by magic bytes: %s", async (path) => {
  await writeFile(
    join(workspace, path),
    pdfWithPages([spanishSentence, "Segunda página"]),
  );
  const result = await readDocument(workspace, path);
  expect(result.structuredContent).toContain(spanishSentence);
  expect(result.structuredContent).toContain("--- Page 1 ---");
  expect(result.structuredContent).toContain("--- Page 2 ---");
  expect(JSON.stringify(result.content)).not.toContain("%PDF");
});

test("pages through extracted PDF text using pi offset and limit", async () => {
  await writeFile(
    join(workspace, "attachment.pdf"),
    pdfWithPages([spanishSentence, "Segunda página"]),
  );
  const full = await readDocument(workspace, "attachment.pdf");
  if (typeof full.structuredContent !== "string")
    throw new Error("Expected text");
  const lines = full.structuredContent.split("\n");
  const offset = lines.indexOf("--- Page 2 ---") + 1;
  expect(
    (await readDocument(workspace, "attachment.pdf", { limit: 1 }))
      .structuredContent,
  ).toContain("Use offset=2 to continue.");
  expect(
    (await readDocument(workspace, "attachment.pdf", { offset }))
      .structuredContent,
  ).toBe(lines.slice(offset - 1).join("\n"));
  await expect(
    readDocument(workspace, "attachment.pdf", { offset: lines.length + 1 }),
  ).rejects.toThrow("beyond end of file");
});

test("reports image-only PDFs with their page count", async () => {
  await writeFile(join(workspace, "scan.pdf"), pdfWithPages(["", ""]));
  const result = await readDocument(workspace, "scan.pdf");
  expect(result.structuredContent).toBe(
    "PDF has 2 pages and no extractable text. It may contain scanned images; an OCR copy is needed to read it.",
  );
  expect(JSON.stringify(result.content)).not.toContain("%PDF");
});

test("returns a note for locked PDFs without exposing their bytes", async () => {
  const pdf = await readFile(new URL("./fixtures/locked.pdf", import.meta.url));
  await writeFile(join(workspace, "locked.pdf"), pdf);
  const result = await readDocument(workspace, "locked.pdf");
  expect(result.structuredContent).toBe(
    "This PDF is locked. Its text cannot be read until the person shares an unlocked copy.",
  );
  expect(JSON.stringify(result.content)).not.toContain("%PDF");
});

test("returns a fixed note for a damaged PDF", async () => {
  await writeFile(join(workspace, "broken.pdf"), "%PDF-1.4\nbroken");
  const log = vi.spyOn(console, "log");
  const warn = vi.spyOn(console, "warn");
  try {
    expect(
      (await readDocument(workspace, "broken.pdf")).structuredContent,
    ).toBe(
      "This PDF file looks damaged, so its text can't be read. Ask the person for a fresh copy.",
    );
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    warn.mockRestore();
  }
});

test("leaves text and image reads unchanged", async () => {
  await writeFile(
    join(workspace, "notes.txt"),
    `${spanishSentence}\nSecond line`,
  );
  expect((await readDocument(workspace, "notes.txt")).structuredContent).toBe(
    `${spanishSentence}\nSecond line`,
  );
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  await writeFile(join(workspace, "image.bin"), Buffer.from(png, "base64"));
  const result = await readDocument(workspace, "image.bin");
  expect(result.content).toContainEqual({
    type: "image",
    mimeType: "image/png",
    data: png,
  });
});

test("uses the singular page label for a scanned PDF", async () => {
  await writeFile(join(workspace, "scan.pdf"), pdfWithPages([""]));
  expect((await readDocument(workspace, "scan.pdf")).structuredContent).toBe(
    "PDF has 1 page and no extractable text. It may contain scanned images; an OCR copy is needed to read it.",
  );
});

test("keeps filesystem failures as errors", async () => {
  await expect(readDocument(workspace, "missing.docx")).rejects.toThrow(
    "ENOENT",
  );
});

test("reads a recovered PDF without logging parser warnings", async () => {
  const pdf = pdfWithPages(["Recovered PDF text"])
    .toString("latin1")
    .replace(/startxref\n\d+/, "startxref\n0");
  await writeFile(join(workspace, "recovered.pdf"), Buffer.from(pdf, "latin1"));
  const log = vi.spyOn(console, "log");
  const warn = vi.spyOn(console, "warn");
  try {
    expect(
      (await readDocument(workspace, "recovered.pdf")).structuredContent,
    ).toBe("--- Page 1 ---\nRecovered PDF text");
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    warn.mockRestore();
  }
});

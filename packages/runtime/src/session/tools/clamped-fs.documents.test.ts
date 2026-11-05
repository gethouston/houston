import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, expect, test } from "vitest";
import { makeClampedFileTools } from "./clamped-fs";
import {
  docxWithBody,
  pdfWithPages,
  spanishSentence,
} from "./document-fixtures.test-helpers";

let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "houston-read-documents-"));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

async function read(
  path: string,
  paging: { offset?: number; limit?: number } = {},
) {
  const tool = makeClampedFileTools(workspace).find(
    (tool) => tool.name === "read",
  );
  if (!tool) throw new Error("Missing read tool");
  return tool.execute(
    "read-document",
    { path, ...paging },
    undefined,
    undefined,
    {} as ExtensionToolContext,
  );
}

test.each([
  "attachment.pdf",
  "renamed.bin",
])("extracts accented PDF text by magic bytes: %s", async (path) => {
  await writeFile(
    join(workspace, path),
    pdfWithPages([spanishSentence, "Segunda página"]),
  );
  const result = await read(path);
  expect(result.structuredContent).toContain(spanishSentence);
  expect(result.structuredContent).toContain("--- Page 1 ---");
  expect(result.structuredContent).toContain("--- Page 2 ---");
  expect(JSON.stringify(result.content)).not.toContain("%PDF");
});

test("extracts DOCX text with entities, run boundaries, tabs, and paragraphs", async () => {
  await writeFile(
    join(workspace, "attachment.DOCX"),
    docxWithBody(
      `<w:p><w:r><w:t>Política de </w:t></w:r><w:r><w:t>honorarios y facturación</w:t><w:tab/><w:t>123 &amp; &#233;</w:t><w:br/><w:t>Final</w:t></w:r></w:p><w:p><w:r><w:t>Otro párrafo</w:t></w:r></w:p>`,
    ),
  );
  const result = await read("attachment.DOCX");
  expect(result.structuredContent).toBe(
    `${spanishSentence}\t123 & é\nFinal\nOtro párrafo\n`,
  );
});

test("pages through extracted PDF text using pi offset and limit", async () => {
  await writeFile(
    join(workspace, "attachment.pdf"),
    pdfWithPages([spanishSentence, "Segunda página"]),
  );
  const full = await read("attachment.pdf");
  if (typeof full.structuredContent !== "string")
    throw new Error("Expected text");
  const lines = full.structuredContent.split("\n");
  const offset = lines.indexOf("--- Page 2 ---") + 1;
  expect(
    (await read("attachment.pdf", { limit: 1 })).structuredContent,
  ).toContain("Use offset=2 to continue.");
  expect((await read("attachment.pdf", { offset })).structuredContent).toBe(
    lines.slice(offset - 1).join("\n"),
  );
  await expect(
    read("attachment.pdf", { offset: lines.length + 1 }),
  ).rejects.toThrow("beyond end of file");
});

test("reports image-only PDFs with their page count", async () => {
  await writeFile(join(workspace, "scan.pdf"), pdfWithPages(["", ""]));
  const result = await read("scan.pdf");
  expect(result.structuredContent).toContain("no extractable text");
  expect(result.structuredContent).toContain("2 pages");
  expect(JSON.stringify(result.content)).not.toContain("%PDF");
});

test("returns a note for locked PDFs without exposing their bytes", async () => {
  const pdf = await readFile(new URL("./fixtures/locked.pdf", import.meta.url));
  await writeFile(join(workspace, "locked.pdf"), pdf);
  const result = await read("locked.pdf");
  expect(result.structuredContent).toBe(
    "This PDF is locked. Its text cannot be read until the person shares an unlocked copy.",
  );
  expect(JSON.stringify(result.content)).not.toContain("%PDF");
});

test("keeps pi's automatic truncation and continuation on DOCX text", async () => {
  const paragraphs = Array.from(
    { length: 2100 },
    (_, i) => `<w:p><w:r><w:t>Paragraph ${i + 1}</w:t></w:r></w:p>`,
  );
  await writeFile(
    join(workspace, "long.docx"),
    docxWithBody(paragraphs.join("")),
  );
  const result = await read("long.docx");
  expect(result.structuredContent).toContain("Paragraph 2000");
  expect(result.structuredContent).not.toContain("Paragraph 2001");
  expect(result.structuredContent).toContain("Use offset=2001 to continue.");
  expect(
    (await read("long.docx", { offset: 2100, limit: 1 })).structuredContent,
  ).toContain("Paragraph 2100");
});

test("rejects malformed PDF data instead of returning binary content", async () => {
  await writeFile(join(workspace, "broken.pdf"), "%PDF-1.4\nbroken");
  await expect(read("broken.pdf")).rejects.toThrow();
});

test("leaves text and image reads unchanged", async () => {
  await writeFile(
    join(workspace, "notes.txt"),
    `${spanishSentence}\nSecond line`,
  );
  expect((await read("notes.txt")).structuredContent).toBe(
    `${spanishSentence}\nSecond line`,
  );
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  await writeFile(join(workspace, "image.bin"), Buffer.from(png, "base64"));
  const result = await read("image.bin");
  expect(result.content).toContainEqual({
    type: "image",
    mimeType: "image/png",
    data: png,
  });
});

test("does not treat arbitrary ZIP archives or plain files as DOCX", async () => {
  const zip = zipSync({ "notes.txt": strToU8("ordinary archive") });
  await writeFile(join(workspace, "archive.docx"), zip);
  expect((await read("archive.docx")).structuredContent).toBe(
    Buffer.from(zip).toString("utf8"),
  );
  for (const text of ["ordinary text", "x", ""]) {
    await writeFile(join(workspace, "plain.docx"), text);
    expect((await read("plain.docx")).structuredContent).toBe(text);
  }
});

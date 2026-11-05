import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  docxWithBody,
  readDocument,
  spanishSentence,
} from "./document-fixtures.test-helpers";

let workspace: string;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "houston-read-word-"));
});
afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

test("extracts DOCX text with entities, run boundaries, tabs, and paragraphs", async () => {
  await writeFile(
    join(workspace, "attachment.DOCX"),
    docxWithBody(
      `<w:p><w:r><w:t>Política de </w:t></w:r><w:r><w:t>honorarios y facturación</w:t><w:tab/><w:t>123 &amp; &#233;</w:t><w:br/><w:t>Final</w:t></w:r></w:p><w:p><w:r><w:t>Otro párrafo</w:t></w:r></w:p>`,
    ),
  );
  const result = await readDocument(workspace, "attachment.DOCX");
  expect(result.structuredContent).toBe(
    `${spanishSentence}\t123 & é\nFinal\nOtro párrafo\n`,
  );
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
  const result = await readDocument(workspace, "long.docx");
  expect(result.structuredContent).toContain("Paragraph 2000");
  expect(result.structuredContent).not.toContain("Paragraph 2001");
  expect(result.structuredContent).toContain("Use offset=2001 to continue.");
  expect(
    (await readDocument(workspace, "long.docx", { offset: 2100, limit: 1 }))
      .structuredContent,
  ).toContain("Paragraph 2100");
});

test.each([
  "locked.docx",
  "legacy.doc",
])("returns a note for CFB Word files: %s", async (path) => {
  await writeFile(
    join(workspace, path),
    Buffer.from("d0cf11e0a1b11ae1", "hex"),
  );
  expect((await readDocument(workspace, path)).structuredContent).toBe(
    "This Word file is locked or in the old .doc format, so its text can't be read here. Ask the person for an unlocked .docx or a PDF.",
  );
});

test.each([
  ["archive.docx", zipSync({ "notes.txt": strToU8("ordinary archive") })],
  ["plain.docx", strToU8("ordinary text")],
  ["short.docx", strToU8("x")],
  ["empty.docx", new Uint8Array()],
])("returns a note for Word files without a main document part: %s", async (path, data) => {
  await writeFile(join(workspace, path), data);
  expect((await readDocument(workspace, path)).structuredContent).toBe(
    "This Word file is locked or in the old .doc format, so its text can't be read here. Ask the person for an unlocked .docx or a PDF.",
  );
});

test.each([
  "custom/main.xml",
  "/custom/main.xml",
])("resolves the main Word part from package relationships: %s", async (mainPart) => {
  await writeFile(
    join(workspace, "renamed.docx"),
    docxWithBody(
      "<w:p><w:r><w:t>Renamed main part</w:t></w:r></w:p>",
      mainPart,
    ),
  );
  expect(
    (await readDocument(workspace, "renamed.docx")).structuredContent,
  ).toBe("Renamed main part\n");
});

test("falls back to word/document.xml without package relationships", async () => {
  await writeFile(
    join(workspace, "fallback.docx"),
    zipSync({
      "word/document.xml": strToU8(
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Fallback part</w:t></w:r></w:p></w:document>',
      ),
    }),
  );
  expect(
    (await readDocument(workspace, "fallback.docx")).structuredContent,
  ).toBe("Fallback part\n");
});

test("extracts text boxes once and resumes after a nested markup fallback", async () => {
  await writeFile(
    join(workspace, "textbox.docx"),
    docxWithBody(
      '<w:p><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice Requires="w"><w:txbxContent><w:p><w:r><w:t>Text box</w:t></w:r></w:p></w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent><w:p><w:r><w:t>Text box</w:t><w:tab/><w:br/></w:r></w:p></w:txbxContent><mc:Fallback><w:p><w:r><w:t>Nested fallback</w:t></w:r></w:p></mc:Fallback></mc:Fallback></mc:AlternateContent><w:r><w:t>After</w:t></w:r></w:p>',
    ),
  );
  expect(
    (await readDocument(workspace, "textbox.docx")).structuredContent,
  ).toBe("Text box\nAfter\n");
});

test.each([
  ["broken ZIP", strToU8("PK\x03\x04broken")],
  ["malformed XML", docxWithBody("<w:p><w:r><w:t>Unclosed")],
  [
    "malformed relationships",
    zipSync({ "_rels/.rels": strToU8("<Relationships>") }),
  ],
])("returns a fixed note for a damaged Word file: %s", async (_, data) => {
  await writeFile(join(workspace, "broken.docx"), data);
  expect((await readDocument(workspace, "broken.docx")).structuredContent).toBe(
    "This Word file looks damaged, so its text can't be read. Ask the person for a fresh copy.",
  );
});

test("skips a Word main part whose declared expanded size exceeds 64 MiB", async () => {
  const zip = Buffer.from(
    zipSync({ "word/document.xml": strToU8("<document/>") }),
  );
  const centralDirectory = zip.indexOf(Buffer.from("PK\x01\x02", "latin1"));
  zip.writeUInt32LE(64 * 1024 * 1024 + 1, centralDirectory + 24);
  await writeFile(join(workspace, "large.docx"), zip);
  expect((await readDocument(workspace, "large.docx")).structuredContent).toBe(
    "This Word document is too large to read here. Ask the person for a smaller copy or a PDF.",
  );
});

test.each([
  "archive.zip",
  "sheet.xlsx",
  "slides.pptx",
])("keeps pi's default ZIP behaviour for %s", async (path) => {
  const zip = docxWithBody("<w:p><w:r><w:t>Unchanged bytes</w:t></w:r></w:p>");
  await writeFile(join(workspace, path), zip);
  expect((await readDocument(workspace, path)).structuredContent).toBe(
    Buffer.from(zip).toString("utf8"),
  );
});

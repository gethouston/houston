import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  detectSupportedImageMimeTypeFromFile,
  type ReadOperations,
} from "@earendil-works/pi-coding-agent";
import { strFromU8, unzipSync } from "fflate";
import { SaxesParser } from "saxes";
import { extractText } from "unpdf";

function docxText(xml: string): string {
  const parser = new SaxesParser({ xmlns: true });
  const parts: string[] = [];
  let inText = false;
  parser.on("opentag", (tag) => {
    if (
      tag.uri !==
        "http://schemas.openxmlformats.org/wordprocessingml/2006/main" &&
      tag.uri !== "http://purl.oclc.org/ooxml/wordprocessingml/main"
    )
      return;
    if (tag.local === "t") inText = true;
    if (tag.local === "tab") parts.push("\t");
    if (tag.local === "br" || tag.local === "cr") parts.push("\n");
  });
  parser.on("text", (text) => {
    if (inText) parts.push(text);
  });
  parser.on("closetag", (tag) => {
    if (tag.local === "t") inText = false;
    if (tag.local === "p") parts.push("\n");
  });
  parser.write(xml).close();
  return parts.join("");
}

export const documentReadOperations: ReadOperations = {
  access: (path) => access(path, constants.R_OK),
  detectImageMimeType: detectSupportedImageMimeTypeFromFile,
  async readFile(path) {
    const buffer = await readFile(path);
    if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
      try {
        const { text, totalPages } = await extractText(new Uint8Array(buffer));
        if (!text.some((page) => page.trim())) {
          return Buffer.from(
            `PDF has ${totalPages} pages and no extractable text. It may contain scanned images; an OCR copy is needed to read it.`,
          );
        }
        return Buffer.from(
          text.map((page, i) => `--- Page ${i + 1} ---\n${page}`).join("\n\n"),
        );
      } catch (error) {
        if (error instanceof Error && error.name === "PasswordException") {
          return Buffer.from(
            "This PDF is locked. Its text cannot be read until the person shares an unlocked copy.",
          );
        }
        throw error;
      }
    }
    if (
      extname(path).toLowerCase() === ".docx" &&
      buffer.subarray(0, 4).toString("latin1") === "PK\x03\x04"
    ) {
      const document = unzipSync(buffer, {
        filter: (file) => file.name === "word/document.xml",
      })["word/document.xml"];
      if (document) return Buffer.from(docxText(strFromU8(document)));
    }
    return buffer;
  },
};

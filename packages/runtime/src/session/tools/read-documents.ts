import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  detectSupportedImageMimeTypeFromFile,
  type ReadOperations,
} from "@earendil-works/pi-coding-agent";
import { extractText, getDocumentProxy } from "unpdf";
import { readWordDocument } from "./read-word-document";

export const documentReadOperations: ReadOperations = {
  access: (path) => access(path, constants.R_OK),
  detectImageMimeType: detectSupportedImageMimeTypeFromFile,
  async readFile(path) {
    const buffer = await readFile(path);
    // PDF magic is distinctive; Word needs its extension because DOCX is a generic ZIP, like XLSX/PPTX.
    if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buffer), {
          verbosity: 0,
        });
        try {
          const { text, totalPages } = await extractText(pdf);
          if (!text.some((page) => page.trim())) {
            return Buffer.from(
              `PDF has ${totalPages} ${totalPages === 1 ? "page" : "pages"} and no extractable text. It may contain scanned images; an OCR copy is needed to read it.`,
            );
          }
          return Buffer.from(
            text
              .map((page, i) => `--- Page ${i + 1} ---\n${page}`)
              .join("\n\n"),
          );
        } finally {
          await pdf.loadingTask.destroy();
        }
      } catch (error) {
        if (error instanceof Error && error.name === "PasswordException") {
          return Buffer.from(
            "This PDF is locked. Its text cannot be read until the person shares an unlocked copy.",
          );
        }
        if (isDamagedPdfError(error)) {
          return Buffer.from(
            "This PDF file looks damaged, so its text can't be read. Ask the person for a fresh copy.",
          );
        }
        throw error;
      }
    }
    const extension = extname(path).toLowerCase();
    if (extension === ".docx" || extension === ".doc") {
      const text = readWordDocument(buffer);
      if (text !== undefined) return Buffer.from(text);
    }
    return buffer;
  },
};

// pdf.js rethrows parser errors from its worker as UnknownErrorException and
// keeps the original class only as the prefix of `details`. Anything else
// wrapped that way (a TypeError, say) is a pdf.js bug and must still throw.
const PDF_FORMAT_ERRORS = [
  "FormatError",
  "XRefEntryException",
  "XRefParseException",
  "ParserEOFException",
];

function isDamagedPdfError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "InvalidPDFException") return true;
  if (error.name !== "UnknownErrorException" || !("details" in error))
    return false;
  const details = String(error.details);
  return PDF_FORMAT_ERRORS.some((name) => details.startsWith(name));
}

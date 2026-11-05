import { posix } from "node:path";
import { FlateErrorCode, strFromU8, unzipSync } from "fflate";
import { SaxesParser } from "saxes";

const WORD_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const MAX_PART_SIZE = 64 * 1024 * 1024;
const CFB_MAGIC = Buffer.from("d0cf11e0a1b11ae1", "hex");
const LOCKED_OR_LEGACY_WORD =
  "This Word file is locked or in the old .doc format, so its text can't be read here. Ask the person for an unlocked .docx or a PDF.";
const NOT_WORD =
  "This file has a Word extension but no Word document inside, so its text can't be read here. Ask the person for the original .docx or a PDF.";
const LARGE_WORD =
  "This Word document is too large to read here. Ask the person for a smaller copy or a PDF.";
const DAMAGED_ZIP_CODES: ReadonlySet<number> = new Set([
  FlateErrorCode.UnexpectedEOF,
  FlateErrorCode.InvalidBlockType,
  FlateErrorCode.InvalidLengthLiteral,
  FlateErrorCode.InvalidDistance,
  FlateErrorCode.InvalidHeader,
  FlateErrorCode.InvalidUTF8,
  FlateErrorCode.InvalidZipData,
  FlateErrorCode.UnknownCompressionMethod,
]);

class DamagedWordXml extends Error {}

function docxText(xml: string): string {
  const parser = new SaxesParser({ xmlns: true });
  const parts: string[] = [];
  let inText = false;
  let fallbackDepth = 0;
  parser.on("error", () => {
    throw new DamagedWordXml();
  });
  parser.on("opentag", (tag) => {
    if (
      fallbackDepth > 0 ||
      (tag.uri ===
        "http://schemas.openxmlformats.org/markup-compatibility/2006" &&
        tag.local === "Fallback")
    ) {
      fallbackDepth++;
      return;
    }
    if (!WORD_NAMESPACES.has(tag.uri)) return;
    if (tag.local === "t") inText = true;
    if (tag.local === "tab") parts.push("\t");
    if (tag.local === "br" || tag.local === "cr") parts.push("\n");
  });
  parser.on("text", (text) => {
    if (inText && fallbackDepth === 0) parts.push(text);
  });
  parser.on("closetag", (tag) => {
    if (fallbackDepth > 0) {
      fallbackDepth--;
      return;
    }
    if (!WORD_NAMESPACES.has(tag.uri)) return;
    if (tag.local === "t") inText = false;
    if (tag.local === "p") parts.push("\n");
  });
  parser.write(xml).close();
  return parts.join("");
}

/**
 * Text of a .docx/.doc, a note when it can't be read, or undefined for content
 * that isn't a Word container at all: RTF or HTML saved as .doc is already
 * text, so pi's plain read handles it.
 */
export function readWordDocument(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 8).equals(CFB_MAGIC)) return LOCKED_OR_LEGACY_WORD;
  if (buffer.subarray(0, 2).toString("latin1") !== "PK") return undefined;
  try {
    let oversized = false;
    const readPart = (name: string) =>
      unzipSync(buffer, {
        filter: (file) => {
          if (file.name !== name) return false;
          if (file.originalSize > MAX_PART_SIZE) {
            oversized = true;
            return false;
          }
          return true;
        },
      })[name];
    const relationships = readPart("_rels/.rels");
    if (oversized) return LARGE_WORD;
    let mainPart = "word/document.xml";
    if (relationships) {
      const parser = new SaxesParser({ xmlns: true });
      parser.on("error", () => {
        throw new DamagedWordXml();
      });
      parser.on("opentag", (tag) => {
        if (
          tag.local === "Relationship" &&
          tag.attributes.Type?.value.endsWith("/officeDocument")
        ) {
          const target = tag.attributes.Target?.value;
          if (target) mainPart = posix.normalize(target).replace(/^\/+/, "");
        }
      });
      parser.write(strFromU8(relationships)).close();
    }
    const document = readPart(mainPart);
    if (oversized) return LARGE_WORD;
    return document ? docxText(strFromU8(document)) : NOT_WORD;
  } catch (error) {
    if (
      error instanceof DamagedWordXml ||
      (error instanceof Error &&
        "code" in error &&
        typeof error.code === "number" &&
        DAMAGED_ZIP_CODES.has(error.code))
    ) {
      return "This Word file looks damaged, so its text can't be read. Ask the person for a fresh copy.";
    }
    throw error;
  }
}

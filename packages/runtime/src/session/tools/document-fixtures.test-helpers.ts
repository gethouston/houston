import { deflateSync } from "node:zlib";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { strToU8, zipSync } from "fflate";
import { makeClampedFileTools } from "./clamped-fs";

export const spanishSentence = "Política de honorarios y facturación";

export function pdfWithPages(pages: string[]): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  for (const [index, text] of pages.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
    );
    const lines = text.split("\n").map((line) => {
      const hex = Buffer.from(line, "latin1").toString("hex");
      return `<${hex}> Tj T*`;
    });
    const stream = deflateSync(
      `BT /F1 12 Tf 14 TL 50 740 Td ${lines.join("\n")} ET`,
    );
    objects.push(
      `<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n${stream.toString("latin1")}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

export function docxWithBody(
  body: string,
  mainPart = "word/document.xml",
): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/${mainPart.replace(/^\//, "")}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${mainPart}"/></Relationships>`,
    ),
    [mainPart.replace(/^\//, "")]: strToU8(
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  });
}

export async function readDocument(
  workspace: string,
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

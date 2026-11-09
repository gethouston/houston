import { OFFICE_MAX_BYTES, officeExtensionSchema } from "@houston/wire-types";
import { CORS, json } from "./http";

// A real one-page PDF lets browser tests exercise the existing PDF renderer.
const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
  "<< /Length 0 >>\nstream\n\nendstream",
];
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(pdf.length);
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = pdf.length;
pdf += `xref\n0 5\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
  .join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

export function fakeOfficePreview(
  path: string,
  bytes: Buffer,
  enabled: boolean,
): Response {
  if (!enabled)
    return json(
      {
        error: "Office preview is not configured",
        code: "conversion_unavailable",
      },
      503,
    );
  if (
    !officeExtensionSchema.safeParse(path.split(".").pop()?.toLowerCase())
      .success
  )
    return json(
      { error: "Unsupported Office file type", code: "unsupported_type" },
      415,
    );
  if (bytes.length > OFFICE_MAX_BYTES)
    return json({ error: "Office file is too large", code: "too_large" }, 413);
  return new Response(pdf, {
    headers: {
      ...CORS,
      "Content-Type": "application/pdf",
      "X-Houston-Page-Count": "1",
    },
  });
}

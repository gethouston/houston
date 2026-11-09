import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext } from "@playwright/test";

/** The seeded mission whose chat links a one-page PDF (HOU-192 specs). */
export const PDF_MISSION_TITLE = "Plan review";
export const PDF_FILE = "plan.pdf";
const MISSION_ID = "act-hou-192";

/** A one-page PDF with a title line, built by hand so the specs need no
 *  fixture file. Offsets are exact, so pdf.js reads it without repair. */
function tinyPdf(): string {
  const text = "BT /F1 32 Tf 72 700 Td (Quarterly plan) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1").toString("base64");
}

/** A mission on the seeded agent whose reply links {@link PDF_FILE}. */
export async function seedChatWithPdf(request: APIRequestContext) {
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/activities`, {
    data: { id: MISSION_ID, title: PDF_MISSION_TITLE, status: "needs_you" },
  });
  await request.post(`${FAKE_HOST_URL}/agents/houston-assistant/files/import`, {
    data: { files: [{ name: PDF_FILE, contentBase64: tinyPdf() }] },
  });
  await request.post(`${FAKE_HOST_URL}/__test__/chat-history`, {
    data: {
      conversationId: `activity-${MISSION_ID}`,
      messages: [
        { role: "user", content: "draft the plan", ts: 1 },
        { role: "assistant", content: `Done: [the plan](${PDF_FILE})`, ts: 2 },
      ],
    },
  });
}

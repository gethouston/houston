import { afterEach, beforeEach, expect, test } from "vitest";
import { SEED_AGENT_ID } from "./config";
import { type FakeHost, startFakeHost } from "./server";

let host: FakeHost;
beforeEach(async () => {
  host = await startFakeHost(0);
});
afterEach(async () => {
  await host.stop();
});
test("Office preview returns PDF while ordinary download preserves the source", async () => {
  const files = `${host.url}/agents/${SEED_AGENT_ID}/files`;
  await fetch(`${files}/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      files: [
        {
          name: "deck.pptx",
          contentBase64: Buffer.from("Office source").toString("base64"),
        },
      ],
    }),
  });
  const preview = await fetch(
    `${files}/download?path=deck.pptx&as=pdf&lang=es-CO`,
  );
  expect(preview.status).toBe(200);
  expect(preview.headers.get("content-type")).toBe("application/pdf");
  expect(preview.headers.get("x-houston-page-count")).toBe("1");
  expect(await preview.text()).toMatch(/^%PDF-/);
  expect(await (await fetch(`${files}/download?path=deck.pptx`)).text()).toBe(
    "Office source",
  );
  await fetch(`${host.url}/__test__/capabilities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ officePreview: false }),
  });
  const off = await fetch(`${files}/download?path=deck.pptx&as=pdf`);
  expect(off.status).toBe(503);
  expect(await off.json()).toMatchObject({ code: "conversion_unavailable" });
  expect(
    (await fetch(`${files}/download?path=missing.pptx&as=pdf`)).status,
  ).toBe(404);
});

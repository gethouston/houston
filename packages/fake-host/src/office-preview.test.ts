import { afterEach, beforeEach, expect, test } from "vitest";
import { SEED_AGENT_ID } from "./config";
import { fakeOfficePreview } from "./office-preview";
import { type FakeHost, startFakeHost } from "./server";

let host: FakeHost;
beforeEach(async () => {
  host = await startFakeHost(0);
});
afterEach(async () => {
  await host.stop();
});
test("Office preview returns PDF while ordinary download preserves the source", async () => {
  expect(
    (await (await fetch(`${host.url}/v1/capabilities`)).json()).officePreview,
  ).toBe(false);
  await fetch(`${host.url}/__test__/capabilities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ officePreview: true }),
  });
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

test("fake Office previews accept 30 MiB and refuse one extra byte", async () => {
  expect(
    fakeOfficePreview("deck.pptx", Buffer.alloc(31_457_280), true).status,
  ).toBe(200);
  const response = fakeOfficePreview(
    "deck.pptx",
    Buffer.alloc(31_457_281),
    true,
  );
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ code: "too_large" });
});

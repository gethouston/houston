import { afterEach, beforeEach, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

const JSON_HEADERS = { "content-type": "application/json" };
const AGENT = "personal/.assistant";
const CHAT = `${encodeURIComponent(AGENT)}/conversations/assistant`;
const request = {
  importId: "onboarding:first_run",
  messages: [
    { role: "assistant", content: "Hi Ana!" },
    { role: "user", content: "Retail" },
  ],
};

let host: FakeHost;
beforeEach(async () => {
  host = await startFakeHost(0);
});
afterEach(async () => {
  await host.stop();
});

const post = (body: unknown) =>
  fetch(`${host.url}/agents/${CHAT}/import`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

it("writes an import once, as the conversation's history", async () => {
  expect(await (await post(request)).json()).toEqual({ ok: true, imported: 2 });
  expect(await (await post(request)).json()).toEqual({ ok: true, imported: 0 });

  const history = (await (
    await fetch(`${host.url}/agents/${CHAT}/messages`)
  ).json()) as { messages: { role: string; content: string }[] };
  expect(history.messages.map((m) => [m.role, m.content])).toEqual([
    ["assistant", "Hi Ana!"],
    ["user", "Retail"],
  ]);
});

it("refuses a body that is not an import", async () => {
  const res = await post({ importId: "x" });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: "invalid_import" });
});

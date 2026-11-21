import { afterEach, beforeEach, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

const JSON_HEADERS = { "content-type": "application/json" };
const CHAT = `${encodeURIComponent("personal/.assistant")}/conversations/assistant`;
const IMPORT = {
  importId: "onboarding:first_run",
  messages: [{ role: "assistant", content: "Your team is ready!" }],
};

let host: FakeHost;
beforeEach(async () => {
  host = await startFakeHost(0);
});
afterEach(async () => {
  await host.stop();
});

const post = (path: string, body: unknown) =>
  fetch(`${host.url}${path}`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });

it("holds an import until released, then writes it", async () => {
  await post("/__test__/hold-imports", { hold: true });
  let answered = false;
  const pending = post(`/agents/${CHAT}/import`, IMPORT).then((res) => {
    answered = true;
    return res.json();
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(answered).toBe(false);

  await post("/__test__/hold-imports", { hold: false });
  expect(await pending).toEqual({ ok: true, imported: 1 });
  expect(await (await post(`/agents/${CHAT}/import`, IMPORT)).json()).toEqual({
    ok: true,
    imported: 0,
  });
});

import { afterEach, beforeEach, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

const JSON_HEADERS = { "content-type": "application/json" };
const CHAT = `${encodeURIComponent("personal/.assistant")}/conversations/assistant`;
const MISSION = { id: "m1", title: "Chase invoices", agent: "ava" };
const CALLS = [
  {
    name: "houston_call",
    args: { operation: "createAgent", params: { name: "Chief of Finance" } },
    content: "created",
  },
  { name: "start_mission", args: { agent: "ava" }, mission: MISSION },
];

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

interface Message {
  role: string;
  content: string;
  tools?: unknown[];
}

async function reply(): Promise<Message> {
  for (;;) {
    const { messages } = (await (
      await fetch(`${host.url}/agents/${CHAT}/messages`)
    ).json()) as { messages: Message[] };
    const last = messages.at(-1);
    if (last?.role === "assistant") return last;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

it("persists the armed tool calls on the next reply, once", async () => {
  await post("/__test__/chat-tools", { calls: CALLS });
  await post("/__test__/chat-reply", { text: "" });
  await post(`/agents/${CHAT}/messages`, { text: "go" });
  expect((await reply()).tools).toEqual([
    {
      name: "houston_call",
      input: CALLS[0].args,
      result: "created",
    },
    { name: "start_mission", input: { agent: "ava" }, mission: MISSION },
  ]);

  await post(`/agents/${CHAT}/messages`, { text: "again" });
  for (;;) {
    const last = await reply();
    if (last.content.includes("again")) {
      expect(last.tools).toBeUndefined();
      break;
    }
  }
});

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { loadActivities, saveActivities } from "@houston/domain";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryVfs } from "../vfs";
import { handleActivitiesData } from "./agent-data-activities";

afterEach(() => vi.useRealTimers());

async function patch(query: string, body: unknown) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T16:25:00.000Z"));
  const store = new MemoryVfs();
  await saveActivities(store, "agent", [
    {
      id: "m1",
      title: "Draft",
      description: "",
      status: "running",
      last_message_at: "2026-10-26T10:00:00.000Z",
    },
  ]);
  const req = Object.assign(
    Readable.from([Buffer.from(JSON.stringify(body))]),
    {
      headers: {},
      url: `/agents/a1/activities/m1${query}`,
    },
  ) as IncomingMessage;
  let status = 0;
  const res = {
    writeHead(code: number) {
      status = code;
    },
    end() {},
  } as unknown as ServerResponse;
  await handleActivitiesData(store, "agent", "a1", "PATCH", "m1", req, res);
  return { status, card: (await loadActivities(store, "agent")).items[0] };
}

test("PATCH query stamps the same write with the host clock", async () => {
  const { status, card } = await patch("?stamp=last_message", {
    status: "needs_you",
  });
  expect(status).toBe(200);
  expect(card).toMatchObject({
    status: "needs_you",
    updated_at: "2026-10-27T16:25:00.000Z",
    last_message_at: "2026-10-27T16:25:00.000Z",
  });
});

test("PATCH without the query preserves the message time", async () => {
  const { status, card } = await patch("", { title: "Renamed" });
  expect(status).toBe(200);
  expect(card).toMatchObject({
    title: "Renamed",
    updated_at: "2026-10-27T16:25:00.000Z",
    last_message_at: "2026-10-26T10:00:00.000Z",
  });
});

test.each([
  ["", { last_message_at: "2000-01-01T00:00:00.000Z" }],
  ["?stamp=unknown", { status: "needs_you" }],
])("refuses a forged timestamp or invalid stamp", async (query, body) => {
  const { status, card } = await patch(query, body);
  expect(status).toBe(400);
  expect(card?.last_message_at).toBe("2026-10-26T10:00:00.000Z");
});

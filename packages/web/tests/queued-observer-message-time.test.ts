import { HoustonClient } from "@houston/engine-adapter/client";
import { disposeAllStreams } from "@houston/engine-adapter/turn-stream";
import { conversationVm } from "@houston/engine-adapter/vm";
import { afterEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  installLocalStorage,
  json,
} from "./support/wire-capture";

const wire = createWireCapture();
afterEach(() => {
  disposeAllStreams();
  wire.restore();
  vi.useRealTimers();
});

test("the queued-send observer forwards status writes without stamping replayed replies", async () => {
  installLocalStorage();
  vi.useFakeTimers();
  let emit: (frames: object[]) => void = () => {};
  let card = {
    id: "m1",
    title: "Draft",
    description: "",
    status: "running",
    last_message_at: "2026-10-26T10:00:00.000Z",
  };
  wire.stubRouted((call) => {
    if (call.url.endsWith("/events") && call.url.includes("/conversations/")) {
      return new Response(
        new ReadableStream({
          start(controller) {
            emit = (frames) =>
              controller.enqueue(
                new TextEncoder().encode(
                  frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(""),
                ),
              );
            emit([
              {
                type: "sync",
                data: { running: true, partial: "", turnId: "old", seq: 0 },
              },
            ]);
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    }
    if (call.method === "PATCH") {
      if (new URL(call.url).searchParams.get("stamp") === "last_message")
        card.last_message_at = "2026-10-27T17:00:00.000Z";
      card = { ...card, ...JSON.parse(call.body ?? "{}") };
      return json(200, card);
    }
    if (call.method === "POST" && call.url.endsWith("/messages"))
      return json(400, { error: "message too long" });
    return json(200, { items: [card], messages: [] });
  });
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  conversationVm.sessionStatus("a1", "activity-m1", "running");
  await client.startSession("a1", {
    sessionKey: "activity-m1",
    prompt: "queued follow-up",
  });
  await vi.advanceTimersByTimeAsync(0);
  emit([
    { type: "text", data: "Earlier reply", turnId: "old", seq: 1 },
    { type: "reply_complete", data: null, turnId: "old", seq: 2 },
  ]);
  await vi.advanceTimersByTimeAsync(0);
  expect(card.last_message_at).toBe("2026-10-26T10:00:00.000Z");
  emit([{ type: "done", data: null, turnId: "old", seq: 3 }]);
  await vi.advanceTimersByTimeAsync(0);
  const patches = wire.calls.filter((call) => call.method === "PATCH");
  expect(
    patches
      .slice(0, 2)
      .map((call) => [
        new URL(call.url).search,
        JSON.parse(call.body ?? "{}").status,
      ]),
  ).toEqual([
    ["", "needs_you"],
    ["", "needs_you"],
  ]);
  expect(patches[2]?.url).toContain("?stamp=last_message");
  expect(
    wire.calls.filter(
      (call) => call.method === "POST" && call.url.endsWith("/messages"),
    ),
  ).toHaveLength(1);
});

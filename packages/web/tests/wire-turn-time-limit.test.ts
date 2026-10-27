import { bus } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";
import { setAdapterErrorSink } from "@houston/engine-adapter/error-sink";
import { disposeAllStreams } from "@houston/engine-adapter/turn-stream";
import { afterEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const { calls, reset, restore, stubRouted } = createWireCapture();
afterEach(() => {
  disposeAllStreams();
  restore();
});

test.each([
  "turn_time_limit",
  "turn_time_limit_unsaved",
])("the gateway ceiling frame %s reaches the typed notice without an error status or report", async (code) => {
  installLocalStorage();
  reset();
  const reports = vi.fn();
  setAdapterErrorSink(reports);
  const events: unknown[] = [];
  const off = bus.on((event) => events.push(event));
  const frame = {
    type: "error",
    data: {
      message:
        "This reply reached the 4-hour limit for one turn. Say continue and the agent picks up from what it saved.",
      code,
    },
    turnId: "t1",
    seq: 2,
  };
  stubRouted((call) => {
    if (call.url.endsWith("/events"))
      return new Response(
        `data: ${JSON.stringify({ type: "sync", data: { running: true, partial: "Saved work", seq: 1, turnId: "t1" }, seq: 1 })}\n\ndata: ${JSON.stringify(frame)}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    if (call.url.endsWith("/messages")) return json(202, { turnId: "t1" });
    if (call.url.endsWith("/activities"))
      return json(200, {
        items: [
          {
            id: "m1",
            session_key: "activity-m1",
            status: "running",
            title: "x",
          },
        ],
      });
    return json(200, { ok: true });
  });
  const client = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  try {
    await client.startSession("a1", {
      sessionKey: "activity-m1",
      prompt: "research",
    });
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "SessionStatus",
          data: expect.objectContaining({
            status: "completed",
            stop_reason: code,
          }),
        }),
      ),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "FeedItem",
        data: expect.objectContaining({
          item: expect.objectContaining({
            feed_type: "system_message",
            notice: code,
            turnId: "t1",
          }),
        }),
      }),
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: "SessionStatus",
        data: expect.objectContaining({ status: "error" }),
      }),
    );
    expect(reports).not.toHaveBeenCalled();
    const stream = calls.find((call) => call.url.endsWith("/events"));
    expect(stream?.url).toBe(
      "http://host/agents/a1/conversations/activity-m1/events",
    );
    expect(stream?.method).toBe("GET");
    expect(stream?.body).toBeNull();
    expect(stream?.headers.get("Authorization")).toBe("Bearer t");
    expect(stream?.headers.get("x-houston-org")).toBe(ORG);
    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            status: "needs_you",
            pending_interaction: null,
          }),
        }),
      ),
    );
    const write = calls.findLast((call) => call.method === "PATCH");
    expect(write?.url).toBe(
      "http://host/agents/a1/activities/m1?stamp=last_message",
    );
    if (!write) throw new Error("missing settle write");
    expectGatewayHeaders(write);
  } finally {
    off();
    setAdapterErrorSink((source, error) => console.error(`[${source}]`, error));
  }
});

import { describe, expect, it, vi } from "vitest";
import { EngineError, HoustonEngineClient } from "./client";

const BASE = "http://127.0.0.1:4317";
const ID = "chat 1/x";
const ENC = `${BASE}/conversations/chat%201%2Fx`;

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function makeClient(respond: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        headers: init?.headers as Record<string, string>,
        ...(init?.body === undefined ? {} : { body: String(init.body) }),
      });
      return respond();
    },
  );
  const client = new HoustonEngineClient({
    baseUrl: BASE,
    token: "tok",
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls };
}

function sse(...chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("the engine client's browser hand-off routes", () => {
  it("streams the live view with the viewer and layout in the query", async () => {
    const { client, calls } = makeClient(() =>
      sse(
        ': hb\n\nevent: status\ndata: {"type":"status"}\n\n',
        'data: {"type":"frame","seq":1}\n\n',
      ),
    );
    const frames: unknown[] = [];
    const onActivity = vi.fn();
    await client.streamBrowserLive(ID, "viewer_12345", "phone", undefined, {
      signal: new AbortController().signal,
      onFrame: (raw) => frames.push(raw),
      onActivity,
    });
    expect(calls).toEqual([
      {
        method: "GET",
        url: `${ENC}/browser/live?viewer=viewer_12345&layout=phone`,
        headers: { Authorization: "Bearer tok" },
      },
    ]);
    expect(frames).toEqual([{ type: "status" }, { type: "frame", seq: 1 }]);
    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it("escapes the viewer into the query", async () => {
    const { client, calls } = makeClient(() => sse());
    await client.streamBrowserLive(ID, "a b/c", "desktop", undefined, {
      signal: new AbortController().signal,
      onFrame: () => {},
    });
    expect(calls[0].url).toBe(
      `${ENC}/browser/live?viewer=a+b%2Fc&layout=desktop`,
    );
  });

  it("names the hand-off a reconnect is for", async () => {
    const { client, calls } = makeClient(() => sse());
    await client.streamBrowserLive(ID, "viewer_12345", "phone", "handoff-1", {
      signal: new AbortController().signal,
      onFrame: () => {},
    });
    expect(calls[0].url).toBe(
      `${ENC}/browser/live?viewer=viewer_12345&layout=phone&handoff=handoff-1`,
    );
  });

  it("throws the refusal status for the SDK to classify", async () => {
    const { client } = makeClient(
      () => new Response('{"error":"no_handoff"}', { status: 404 }),
    );
    const failure = client.streamBrowserLive(
      ID,
      "viewer_12345",
      "desktop",
      undefined,
      {
        signal: new AbortController().signal,
        onFrame: () => {},
      },
    );
    await expect(failure).rejects.toBeInstanceOf(EngineError);
    await expect(failure).rejects.toMatchObject({ status: 404 });
  });

  it("posts one input batch as JSON and returns the raw answer", async () => {
    const { client, calls } = makeClient(
      () =>
        new Response('{"state":"waiting"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const body = {
      events: [{ type: "text", text: "hi" }],
      ack: { viewer: "viewer_12345", seq: 3 },
    };
    await expect(client.browserInput(ID, body)).resolves.toEqual({
      state: "waiting",
    });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${ENC}/browser/input`,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer tok",
        },
        body: JSON.stringify(body),
      },
    ]);
  });
});

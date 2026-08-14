import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import type { RuntimeEndpoint } from "../ports";
import { ProxyChannel } from "./proxy";

const workspace: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "local",
  createdAt: 1,
};
const agent: Agent = {
  id: "agent-1",
  workspaceId: "w1",
  name: "Helper",
  createdAt: 1,
};
const endpoint: RuntimeEndpoint = {
  baseUrl: "https://runtime.example",
  token: "runtime-token",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function request(): IncomingMessage {
  return { headers: {} } as unknown as IncomingMessage;
}

function response(statusCode = 200): ServerResponse {
  return { statusCode } as ServerResponse;
}

function channelWith(opts: {
  capture: () => Promise<void>;
  stopCapture?: (agentId: string, conversationId: string) => void;
  forward?: (_res: ServerResponse) => Promise<void>;
}) {
  return new ProxyChannel({
    launcher: {
      async ensureAwake() {
        return endpoint;
      },
      async sleep() {},
      async destroy() {},
      async status() {
        return "running" as const;
      },
    },
    proxy: {
      async forward(_endpoint, _request, res) {
        await opts.forward?.(res);
      },
    },
    credentials: new MemoryCredentialStore(),
    forwardActingHeader: false,
    turnLogCapture: {
      capture: opts.capture,
      stopCapture: opts.stopCapture ?? (() => {}),
    },
  });
}

test("interactive dispatch awaits capture attach before posting the turn", async () => {
  const attach = deferred();
  const order: string[] = [];
  const channel = channelWith({
    capture: async () => {
      order.push("capture");
      await attach.promise;
      order.push("attached");
    },
    forward: async () => {
      order.push("post");
    },
  });
  const dispatched = channel.dispatch(
    { workspace, agent, body: Buffer.from('{"text":"hi"}') },
    "POST",
    "conversations/c1/messages",
    new URL("https://host/conversations/c1/messages"),
    request(),
    response(),
  );

  await vi.waitFor(() => expect(order).toEqual(["capture"]));
  attach.resolve();
  await dispatched;
  expect(order).toEqual(["capture", "attached", "post"]);
});

test("routine dispatch awaits capture attach before posting the turn", async () => {
  const attach = deferred();
  const order: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      order.push("post");
      return new Response(null, { status: 202 });
    }),
  );
  const channel = channelWith({
    capture: async () => {
      order.push("capture");
      await attach.promise;
      order.push("attached");
    },
  });
  const firing = channel.fireTurn({ workspace, agent }, "routine-c1", "run");

  await vi.waitFor(() => expect(order).toEqual(["capture"]));
  attach.resolve();
  await firing;
  expect(order).toEqual(["capture", "attached", "post"]);
});

test("interactive dispatch proceeds after the capture attach timeout", async () => {
  vi.useFakeTimers();
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const forward = vi.fn(async () => {});
  const channel = channelWith({
    capture: () => new Promise<void>(() => {}),
    forward,
  });
  const dispatched = channel.dispatch(
    { workspace, agent, body: Buffer.from('{"text":"hi"}') },
    "POST",
    "conversations/c1/messages",
    new URL("https://host/conversations/c1/messages"),
    request(),
    response(),
  );

  await vi.advanceTimersByTimeAsync(1_499);
  expect(forward).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await dispatched;
  expect(forward).toHaveBeenCalledTimes(1);
  expect(debug).toHaveBeenCalledWith(
    expect.stringContaining("capture attach timed out for c1"),
  );
});

test("interactive non-ok turn response tears down its conversation capture", async () => {
  const stopCapture = vi.fn();
  const channel = channelWith({
    capture: async () => {},
    stopCapture,
    forward: async (res) => {
      res.statusCode = 500;
    },
  });

  await channel.dispatch(
    { workspace, agent, body: Buffer.from('{"text":"hi"}') },
    "POST",
    "conversations/c1/messages",
    new URL("https://host/conversations/c1/messages"),
    request(),
    response(),
  );
  expect(stopCapture).toHaveBeenCalledWith("agent-1", "c1");
});

test("routine POST failure tears down its conversation capture", async () => {
  const stopCapture = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("failed", { status: 500 })),
  );
  const channel = channelWith({ capture: async () => {}, stopCapture });

  await expect(
    channel.fireTurn({ workspace, agent }, "routine-c1", "run"),
  ).rejects.toThrow("runtime 500");
  expect(stopCapture).toHaveBeenCalledWith("agent-1", "routine-c1");
});

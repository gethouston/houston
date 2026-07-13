import { streamGlobalEvents } from "@houston/runtime-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Clock, SdkLogger } from "../../ports";
import { startTurnsEventStream } from "./events-stream";

vi.mock("@houston/runtime-client", () => ({
  streamGlobalEvents: vi.fn(),
}));

const clock: Clock = {
  now: () => 0,
  setTimeout: () => 1,
  clearTimeout: () => {},
};

function logger(debug: ReturnType<typeof vi.fn>): SdkLogger {
  return {
    debug,
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

describe("turns global event stream", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes conversation changes, reconnects, failures, and disposal", () => {
    let options: Parameters<typeof streamGlobalEvents>[0] | undefined;
    vi.mocked(streamGlobalEvents).mockImplementation(async (next) => {
      options = next;
    });
    const onConnect = vi.fn();
    const onConversationsChanged = vi.fn();
    const onUnauthorized = vi.fn();
    const debug = vi.fn();

    const stop = startTurnsEventStream({
      baseUrl: "https://host.example/",
      fetch: vi.fn(),
      clock,
      logger: logger(debug),
      handlers: { onConnect, onConversationsChanged, onUnauthorized },
    });

    expect(options?.url()).toBe("https://host.example/v1/events");
    options?.onConnect?.();
    options?.onEvent?.({ type: "ActivityChanged", agentPath: "a-1" });
    options?.onEvent?.({ type: "ConversationsChanged", agentPath: "a-1" });
    options?.onEvent?.({ type: "ConversationsChanged" });
    options?.onUnauthorized?.();
    options?.onError?.(new Error("offline"));

    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConversationsChanged).toHaveBeenNthCalledWith(1, "a-1");
    expect(onConversationsChanged).toHaveBeenNthCalledWith(2, undefined);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(debug).toHaveBeenCalledWith("turns event stream dropped", {
      error: "Error: offline",
    });
    expect(options?.signal.aborted).toBe(false);
    stop();
    expect(options?.signal.aborted).toBe(true);
  });
});

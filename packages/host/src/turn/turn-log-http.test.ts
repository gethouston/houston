import type { SequencedFrame } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type { PodGatewayConfig } from "../pod-gateway";
import { HttpTurnLogSender } from "./turn-log-http";

afterEach(() => {
  vi.restoreAllMocks();
});

test("a 404 disables turnlog delivery once for deploy skew", async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async () => new Response("old gateway", { status: 404 }),
  );
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const gateway: PodGatewayConfig = {
    baseUrl: "https://gateway.example",
    orgSlug: "acme",
    agentSlug: "helper",
    podToken: "pod-token",
    bootId: "boot-1",
    fence: {},
  };
  const sender = new HttpTurnLogSender({
    gateway,
    fetchImpl,
    retryDelaysMs: [],
  });
  const frames = [
    { type: "done", data: {}, seq: 1 } as unknown as SequencedFrame,
  ];

  await sender.send("c1", frames);
  await sender.send("c1", frames);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(debug).toHaveBeenCalledTimes(1);
});

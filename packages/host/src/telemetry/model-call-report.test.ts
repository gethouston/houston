import type { ModelCallReport } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { createModelCallForwarder } from "./model-call-report";

const quad = {
  url: "http://gateway.test/",
  orgSlug: "acme",
  agentSlug: "0123456789abcdef",
  podToken: "pod-token",
};
const report = (turnId: string): ModelCallReport => ({
  v: 1,
  turnId,
  backend: "claude",
  startupMs: { harness_init: 800 },
  calls: [],
  droppedCalls: 0,
});

function harness(status: number | Error) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    sent.push({ url: String(url), init: init ?? {} });
    if (status instanceof Error) throw status;
    return new Response(null, { status });
  };
  const warn = vi.fn();
  const error = vi.fn();
  const forward = createModelCallForwarder({
    report: quad,
    fetchImpl,
    warn,
    error,
  });
  return { sent, warn, error, forward };
}

test("posts the report once per turn with the pod bearer", async () => {
  const { sent, forward, warn, error } = harness(200);
  forward(report("t1"));
  forward(report("t1"));
  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.url).toBe(
    "http://gateway.test/v1/pod/model-calls/acme/0123456789abcdef",
  );
  const headers = sent[0]?.init.headers as Record<string, string>;
  expect(headers.Authorization).toBe("Bearer pod-token");
  expect(JSON.parse(String(sent[0]?.init.body))).toEqual(report("t1"));
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

test("a gateway without the ingest (or refusing the token) warns once", async () => {
  const { sent, forward, warn, error } = harness(404);
  forward(report("t1"));
  forward(report("t2"));
  await vi.waitFor(() => expect(sent).toHaveLength(2));
  await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 10));
  expect(warn).toHaveBeenCalledTimes(1);
  expect(error).not.toHaveBeenCalled();
});

test("transient failures warn; a contract refusal errors once", async () => {
  const net = harness(new TypeError("fetch failed"));
  net.forward(report("t1"));
  await vi.waitFor(() => expect(net.warn).toHaveBeenCalledTimes(1));
  expect(net.error).not.toHaveBeenCalled();

  const refused = harness(400);
  refused.forward(report("t1"));
  refused.forward(report("t2"));
  await vi.waitFor(() => expect(refused.sent).toHaveLength(2));
  await vi.waitFor(() => expect(refused.error).toHaveBeenCalledTimes(1));
  await new Promise((r) => setTimeout(r, 10));
  expect(refused.error).toHaveBeenCalledTimes(1);
});

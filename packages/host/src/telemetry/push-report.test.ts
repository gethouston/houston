import type { PushReport } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { createPushReporter } from "./push-report";

const report: PushReport = {
  v: 1,
  kind: "mentioned",
  conversation_id: "c",
  mission: null,
  event_key: "n",
  user_ids: ["u"],
};
const gateway = {
  url: "https://gateway.test/",
  orgSlug: "org",
  agentSlug: "0123456789abcdef",
  podToken: "turn-token",
};

test("uses the managed gateway path, bearer and acting header", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const send = createPushReporter({
    report: gateway,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 202 });
    },
  });
  await send(report, "acting-token");
  expect(calls[0]?.url).toBe(
    "https://gateway.test/v1/pod/push/org/0123456789abcdef",
  );
  expect(calls[0]?.init?.headers).toMatchObject({
    authorization: "Bearer turn-token",
    "x-houston-acting-as": "acting-token",
  });
  expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(report);
});

test("retries network and 5xx three times without throwing", async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce(new Response(null, { status: 500 }))
    .mockResolvedValueOnce(new Response(null, { status: 202 }));
  await createPushReporter({
    report: gateway,
    fetchImpl,
    retryDelaysMs: [0, 0],
  })(report);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

test.each([
  401, 404, 503,
])("status %s warns once then stays quiet", async (status) => {
  const warn = vi.fn();
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status }));
  const send = createPushReporter({ report: gateway, fetchImpl, warn });
  await send(report);
  await send(report);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

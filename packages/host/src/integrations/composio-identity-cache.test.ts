import { afterEach, expect, test, vi } from "vitest";
import { ComposioIdentityCache } from "./composio-identity-cache";
import type { ActionResult, Connection } from "./types";

const USER = "user-1";
const GMAIL: Connection = {
  toolkit: "gmail",
  connectionId: "ca_1",
  status: "active",
};
const LABELLED: ActionResult = {
  successful: true,
  data: { emailAddress: "user@example.test" },
};

afterEach(() => {
  vi.useRealTimers();
});

function cacheWith(replies: Array<() => Promise<ActionResult>>) {
  let probes = 0;
  const cache = new ComposioIdentityCache(() => {
    const reply = replies[Math.min(probes, replies.length - 1)];
    probes++;
    if (!reply) throw new Error("no reply scripted");
    return reply();
  });
  return { cache, probes: () => probes };
}

test("concurrent lists share one probe for the same account", async () => {
  const held = Promise.withResolvers<ActionResult>();
  const { cache, probes } = cacheWith([() => held.promise]);
  const first = cache.enrich(USER, [GMAIL]);
  const second = cache.enrich(USER, [GMAIL]);
  expect(probes()).toBe(1);
  held.resolve(LABELLED);
  const labelled = [{ ...GMAIL, accountLabel: "user@example.test" }];
  expect(await first).toEqual(labelled);
  expect(await second).toEqual(labelled);
  expect(probes()).toBe(1);
});

test("a probe that throws is retried on the next list", async () => {
  const { cache, probes } = cacheWith([
    () => Promise.reject(new Error("composio POST → 502")),
    () => Promise.resolve(LABELLED),
  ]);
  expect(await cache.enrich(USER, [GMAIL])).toEqual([GMAIL]);
  expect(await cache.enrich(USER, [GMAIL])).toEqual([
    { ...GMAIL, accountLabel: "user@example.test" },
  ]);
  expect(probes()).toBe(2);
});

test("a stalled probe stops holding lists at the deadline", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const stalled = Promise.withResolvers<ActionResult>();
  const { cache, probes } = cacheWith([
    () => stalled.promise,
    () => Promise.resolve(LABELLED),
  ]);
  const first = cache.enrich(USER, [GMAIL]);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await first).toEqual([GMAIL]);
  expect(await cache.enrich(USER, [GMAIL])).toEqual([
    { ...GMAIL, accountLabel: "user@example.test" },
  ]);
  expect(probes()).toBe(2);
  stalled.resolve({ successful: true, data: { emailAddress: "late@x.test" } });
  expect(await cache.enrich(USER, [GMAIL])).toEqual([
    { ...GMAIL, accountLabel: "user@example.test" },
  ]);
});

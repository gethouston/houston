import { expect, test } from "vitest";
import {
  caresLookup,
  type FenceResolver,
  limiter,
  osLookup,
  type ResolvedAddress,
} from "./fence-resolve";
import { judgeTarget } from "./fence-target";

const fail = (code: string) =>
  Promise.reject(Object.assign(new Error(code), { code }));

function resolverFor(
  zone: Record<string, { v4?: string[] | string; v6?: string[] | string }>,
): FenceResolver {
  const answer = (records: string[] | string | undefined) =>
    typeof records === "string"
      ? fail(records)
      : records
        ? Promise.resolve(records)
        : fail("ENODATA");
  return {
    resolve4: (host) =>
      answer(zone[host]?.v4 ?? (zone[host] ? undefined : "ENOTFOUND")),
    resolve6: (host) =>
      answer(zone[host]?.v6 ?? (zone[host] ? undefined : "ENOTFOUND")),
  };
}

test("both families are asked; IPv4 answers come first", async () => {
  const lookup = caresLookup(
    resolverFor({ "a.test": { v4: ["198.51.100.1"], v6: ["2001:db8::1"] } }),
  );
  expect(await lookup("a.test")).toEqual([
    { address: "198.51.100.1", family: 4 },
    { address: "2001:db8::1", family: 6 },
  ]);
});

test("one family's failure leaves the other's answers", async () => {
  const lookup = caresLookup(
    resolverFor({ "v6.test": { v4: "ETIMEOUT", v6: ["2001:db8::2"] } }),
  );
  expect(await lookup("v6.test")).toEqual([
    { address: "2001:db8::2", family: 6 },
  ]);
});

test("no records at all is a miss the fence reads as unreachable", async () => {
  const lookup = caresLookup(resolverFor({ "none.test": {} }));
  await expect(lookup("none.test")).rejects.toMatchObject({
    code: "ENOTFOUND",
  });
  expect(await judgeTarget("none.test", "blocked", lookup)).toEqual({
    kind: "unreachable",
  });
  expect(await judgeTarget("nx.test", "blocked", lookup)).toEqual({
    kind: "unreachable",
  });
});

test("a server that never answers hits the deadline, and the slot frees", async () => {
  const never = new Promise<string[]>(() => undefined);
  const lookup = caresLookup(
    { resolve4: () => never, resolve6: () => never },
    20,
    1,
  );
  await expect(lookup("slow.test")).rejects.toMatchObject({
    code: "ETIMEOUT",
  });
  await expect(lookup("slow2.test")).rejects.toMatchObject({
    code: "ETIMEOUT",
  });
  expect(await judgeTarget("slow3.test", "blocked", lookup)).toEqual({
    kind: "unreachable",
  });
});

test("at most N lookups run at once; the rest wait their turn", async () => {
  const limit = limiter(2);
  let running = 0;
  let peak = 0;
  const releases: (() => void)[] = [];
  const task = () =>
    limit(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise<void>((resolve) => releases.push(resolve));
      running -= 1;
    });
  const all = Promise.all([task(), task(), task(), task(), task()]);
  for (let i = 0; i < 5; i++) {
    await expect.poll(() => releases.length).toBeGreaterThan(i);
    releases[i]?.();
  }
  await all;
  expect(peak).toBe(2);
});

test("an OS lookup past its deadline fails, but holds its slot until the OS answers", async () => {
  const pending: ((answers: ResolvedAddress[]) => void)[] = [];
  const asked: string[] = [];
  const lookup = osLookup(
    (host) =>
      new Promise((resolve) => {
        asked.push(host);
        pending.push(resolve);
      }),
    100,
    1,
  );
  await expect(lookup("slow.lan")).rejects.toMatchObject({ code: "ETIMEOUT" });
  const next = lookup("next.lan");
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(asked).toEqual(["slow.lan"]);
  pending[0]?.([]);
  await expect.poll(() => asked).toEqual(["slow.lan", "next.lan"]);
  pending[1]?.([{ address: "10.0.0.2", family: 4 }]);
  expect(await next).toEqual([{ address: "10.0.0.2", family: 4 }]);
});

test("a re-ask after the deadline joins the running OS lookup, not a second slot", async () => {
  const pending: ((answers: ResolvedAddress[]) => void)[] = [];
  const asked: string[] = [];
  const lookup = osLookup(
    (host) =>
      new Promise((resolve) => {
        asked.push(host);
        pending.push(resolve);
      }),
    30,
    2,
  );
  const gone = new AbortController();
  await expect(lookup("slow.lan", gone.signal)).rejects.toMatchObject({
    code: "ETIMEOUT",
  });
  gone.abort();
  const retry = lookup("slow.lan");
  const other = lookup("other.lan");
  await expect.poll(() => asked).toEqual(["slow.lan", "other.lan"]);
  pending[0]?.([{ address: "10.0.0.4", family: 4 }]);
  expect(await retry).toEqual([{ address: "10.0.0.4", family: 4 }]);
  pending[1]?.([]);
  await other;
});

test("a lookup whose browser left is skipped while queued, and same-host asks share one", async () => {
  const asked: string[] = [];
  const releases: (() => void)[] = [];
  const lookup = osLookup(
    (host) =>
      new Promise((resolve) => {
        asked.push(host);
        releases.push(() => resolve([{ address: "10.0.0.3", family: 4 }]));
      }),
    1_000,
    1,
  );
  const first = lookup("a.lan");
  const shared = lookup("a.lan");
  const gone = new AbortController();
  const queued = lookup("b.lan", gone.signal);
  gone.abort();
  await expect(queued).rejects.toMatchObject({ code: "ABORT_ERR" });
  releases[0]?.();
  expect(await first).toEqual(await shared);
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(asked).toEqual(["a.lan"]);
});

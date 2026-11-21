import { expect, test } from "vitest";
import { limiter, shareInFlight } from "./fence-limit";

function held(started: string[], name: string) {
  let release: (value: string) => void = () => undefined;
  const done = new Promise<string>((resolve) => {
    release = resolve;
  });
  return {
    task: () => {
      started.push(name);
      return done;
    },
    release: () => release(name),
  };
}

test("a queued task whose caller left is skipped, and its turn passes on", async () => {
  const limit = limiter(1);
  const started: string[] = [];
  const first = held(started, "first");
  const gone = held(started, "gone");
  const next = held(started, "next");
  const leave = new AbortController();
  const running = limit(first.task);
  const skipped = limit(gone.task, leave.signal);
  const waiting = limit(next.task);
  leave.abort();
  await expect(skipped).rejects.toMatchObject({ code: "ABORT_ERR" });
  first.release();
  await running;
  await expect.poll(() => started).toEqual(["first", "next"]);
  next.release();
  expect(await waiting).toBe("next");
});

test("an already-aborted caller never queues", async () => {
  const limit = limiter(1);
  await expect(
    limit(async () => "ran", AbortSignal.abort()),
  ).rejects.toMatchObject({ code: "ABORT_ERR" });
  expect(await limit(async () => "ran")).toBe("ran");
});

test("callers asking for the same key share one run, cleared once it settles", async () => {
  let runs = 0;
  const releases: (() => void)[] = [];
  const lookup = shareInFlight(
    (key) =>
      new Promise<string>((resolve) => {
        runs += 1;
        releases.push(() => resolve(`${key}#${runs}`));
      }),
  );
  const a = lookup("a.test");
  const b = lookup("a.test");
  const other = lookup("b.test");
  expect(runs).toBe(2);
  for (const release of releases) release();
  expect(await a).toBe("a.test#2");
  expect(await b).toBe("a.test#2");
  expect(await other).toBe("b.test#2");
  const again = lookup("a.test");
  expect(runs).toBe(3);
  releases[2]?.();
  expect(await again).toBe("a.test#3");
});

test("the run's signal aborts only once every caller left", async () => {
  let runSignal: AbortSignal | undefined;
  const lookup = shareInFlight((_key, signal) => {
    runSignal = signal;
    return new Promise<string>(() => undefined);
  });
  const one = new AbortController();
  const two = new AbortController();
  const first = lookup("slow.test", one.signal);
  const second = lookup("slow.test", two.signal);
  one.abort();
  await expect(first).rejects.toMatchObject({ code: "ABORT_ERR" });
  expect(runSignal?.aborted).toBe(false);
  two.abort();
  await expect(second).rejects.toMatchObject({ code: "ABORT_ERR" });
  expect(runSignal?.aborted).toBe(true);
});

test("a held run stays joinable after every caller left, until it settles", async () => {
  let runs = 0;
  let release: (() => void) | undefined;
  const lookup = shareInFlight((key, _signal, hold) => {
    runs += 1;
    hold();
    return new Promise<string>((resolve) => {
      release = () => resolve(`${key}#${runs}`);
    });
  });
  const gone = new AbortController();
  const first = lookup("held.test", gone.signal);
  gone.abort();
  await expect(first).rejects.toMatchObject({ code: "ABORT_ERR" });
  const again = lookup("held.test");
  expect(runs).toBe(1);
  release?.();
  expect(await again).toBe("held.test#1");
  void lookup("held.test");
  expect(runs).toBe(2);
});

test("a caller that leaves after its turn came, before it ran, passes the slot on", async () => {
  const limit = limiter(1);
  const started: string[] = [];
  const first = held(started, "first");
  const gone = held(started, "gone");
  const next = held(started, "next");
  const leave = new AbortController();
  const remove = leave.signal.removeEventListener.bind(leave.signal);
  leave.signal.removeEventListener = (
    ...args: Parameters<AbortSignal["removeEventListener"]>
  ) => {
    remove(...args);
    leave.abort();
  };
  const running = limit(first.task);
  const skipped = limit(gone.task, leave.signal);
  const waiting = limit(next.task);
  first.release();
  await running;
  await expect(skipped).rejects.toMatchObject({ code: "ABORT_ERR" });
  await expect.poll(() => started).toEqual(["first", "next"]);
  next.release();
  expect(await waiting).toBe("next");
});

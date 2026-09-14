import { afterEach, expect, test, vi } from "vitest";
import {
  createProviderConnectionMonitor,
  observeProviderConnection,
} from "./provider-connection-observer";

afterEach(() => vi.useRealTimers());

test("unknown and failed probes retry; confirmed connection completes once", async () => {
  vi.useFakeTimers();
  const probe = vi
    .fn()
    .mockResolvedValueOnce("checking")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce("disconnected")
    .mockResolvedValue("connected");
  const onConnected = vi.fn();
  const onError = vi.fn();
  const stop = observeProviderConnection({
    probe,
    onState: vi.fn(),
    onConnected,
    onError,
    autoContinue: true,
  });
  await vi.advanceTimersByTimeAsync(6000);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onConnected).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10000);
  expect(probe).toHaveBeenCalledTimes(4);
  stop();
});

test("dismissal invalidates an outstanding successful probe", async () => {
  let resolve!: (state: "connected") => void;
  const onConnected = vi.fn();
  const onState = vi.fn();
  const stop = observeProviderConnection({
    probe: () =>
      new Promise((done) => {
        resolve = done;
      }),
    onState,
    onConnected,
    onError: vi.fn(),
    autoContinue: true,
  });
  stop();
  resolve("connected");
  await Promise.resolve();
  expect(onState).not.toHaveBeenCalled();
  expect(onConnected).not.toHaveBeenCalled();
});

test("revisited completed steps show their status without advancing", async () => {
  vi.useFakeTimers();
  const onConnected = vi.fn();
  const onState = vi.fn();
  const stop = observeProviderConnection({
    probe: async () => "connected",
    onState,
    onConnected,
    onError: vi.fn(),
    autoContinue: false,
  });
  await vi.advanceTimersByTimeAsync(4000);
  expect(onState).toHaveBeenCalledWith("connected");
  expect(onConnected).not.toHaveBeenCalled();
  stop();
});

test("Cancel invalidates an in-flight success until explicit retry", async () => {
  vi.useFakeTimers();
  const pending: ((state: "connected") => void)[] = [];
  const probe = vi.fn(
    () => new Promise<"connected">((resolve) => pending.push(resolve)),
  );
  const onConnected = vi.fn();
  const monitor = createProviderConnectionMonitor({
    probe,
    onState: vi.fn(),
    onConnected,
    onError: vi.fn(),
    autoContinue: true,
  });
  monitor.cancel();
  pending[0]("connected");
  await vi.advanceTimersByTimeAsync(10000);
  expect(onConnected).not.toHaveBeenCalled();
  expect(probe).toHaveBeenCalledTimes(1);
  monitor.retry();
  pending[1]("connected");
  await Promise.resolve();
  expect(onConnected).toHaveBeenCalledTimes(1);
  monitor.retry();
  expect(probe).toHaveBeenCalledTimes(2);
  monitor.dispose();
});

test("cancelled flow restored after hide/show stays actionable until retry", async () => {
  vi.useFakeTimers();
  const probe = vi.fn(async () => "connected" as const);
  const onConnected = vi.fn();
  const onState = vi.fn();
  const options = {
    probe,
    onState,
    onConnected,
    onError: vi.fn(),
    autoContinue: true,
  };
  const first = createProviderConnectionMonitor(options);
  first.cancel();
  first.dispose();
  const restored = createProviderConnectionMonitor({
    ...options,
    initiallyPaused: true,
  });
  await vi.advanceTimersByTimeAsync(10000);
  expect(onConnected).not.toHaveBeenCalled();
  expect(onState).not.toHaveBeenCalledWith("connected");
  expect(probe).toHaveBeenCalledTimes(1);
  restored.retry();
  await Promise.resolve();
  expect(onConnected).toHaveBeenCalledTimes(1);
  restored.dispose();
});

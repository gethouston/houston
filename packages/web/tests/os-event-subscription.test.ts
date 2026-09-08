import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listen: vi.fn(), report: vi.fn() }));
vi.mock("../../../app/src/lib/os-bridge", () => ({
  legacyListen: mocks.listen,
  legacyEmit: vi.fn(),
}));
vi.mock("../../../app/src/lib/engine", () => ({ getEngineWs: vi.fn() }));
vi.mock("../../../app/src/lib/error-toast", () => ({
  showErrorToast: mocks.report,
}));

import { listenOsEvent } from "../../../app/src/lib/events";

beforeEach(() => vi.resetAllMocks());

test("late native wake subscriptions are disposed and cannot wake another scope", async () => {
  let installed!: (off: () => void) => void;
  mocks.listen.mockReturnValue(
    new Promise<() => void>((resolve) => {
      installed = resolve;
    }),
  );
  const handler = vi.fn();
  const dispose = listenOsEvent("app-activated", handler);
  dispose();
  const off = vi.fn();
  installed(off);
  await Promise.resolve();
  const receive = mocks.listen.mock.calls[0]?.[1] as (event: {
    payload: null;
  }) => void;
  receive({ payload: null });
  expect(off).toHaveBeenCalledOnce();
  expect(handler).not.toHaveBeenCalled();
});

test("native wake subscription errors use the app reporting paths", async () => {
  const failure = new Error("native listener unavailable");
  mocks.listen.mockRejectedValue(failure);
  listenOsEvent("app-activated", vi.fn());
  await Promise.resolve();
  await Promise.resolve();
  expect(mocks.report).toHaveBeenCalledWith(
    "os_event_subscribe",
    "OS event subscription failed",
    failure,
  );
});

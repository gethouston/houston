import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cleanMissionTitle,
  generateMissionTitle,
  parseMissionTitle,
  runMissionTitle,
} from "./mission-title";

const REQ = {
  fallback: "Write the weekly...",
  text: "Write the weekly sales report",
};

afterEach(() => vi.restoreAllMocks());

describe("parseMissionTitle", () => {
  test("keeps a well-formed request and drops anything malformed", () => {
    expect(parseMissionTitle(REQ)).toEqual(REQ);
    expect(parseMissionTitle(undefined)).toBeUndefined();
    expect(parseMissionTitle({ fallback: "x" })).toBeUndefined();
    expect(parseMissionTitle({ fallback: " ", text: "t" })).toBeUndefined();
  });
});

describe("cleanMissionTitle", () => {
  test("first line, no quotes, at most six words", () => {
    expect(cleanMissionTitle('"Weekly sales report."\nextra')).toBe(
      "Weekly sales report",
    );
    expect(cleanMissionTitle("one two three four five six seven")).toBe(
      "one two three four five six",
    );
    expect(cleanMissionTitle("  ")).toBeNull();
  });
});

describe("generateMissionTitle", () => {
  test("returns the cleaned title from the runner", async () => {
    const run = vi.fn(async () => "Weekly sales summary");
    await expect(generateMissionTitle("c1", REQ, run)).resolves.toBe(
      "Weekly sales summary",
    );
    expect(run).toHaveBeenCalledWith(REQ.text, expect.any(AbortSignal));
  });

  test("a title equal to the fallback writes nothing", async () => {
    const req = { fallback: "Weekly report", text: "weekly report" };
    const run = async () => "Weekly report";
    await expect(generateMissionTitle("c1", req, run)).resolves.toBeNull();
  });

  test("a failing runner keeps the fallback and reports, never throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const run = async (): Promise<string> => {
      throw new Error("quota");
    };
    await expect(generateMissionTitle("c1", REQ, run)).resolves.toBeNull();
    expect(error).toHaveBeenCalledOnce();
  });

  test("a runner past the cap keeps the fallback and is aborted", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const run = (_excerpt: string, s: AbortSignal) => {
      signal = s;
      return new Promise<string>(() => {});
    };
    const pending = generateMissionTitle("c1", REQ, run, 10_000);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });
});

describe("runMissionTitle cancel", () => {
  test("a caller's cancel aborts the call quietly", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const run = (_excerpt: string, s: AbortSignal) => {
      signal = s;
      return new Promise<string>(() => {});
    };
    const cancel = new AbortController();
    const pending = runMissionTitle("c1", REQ, run, 10_000, {
      cancel: cancel.signal,
    });
    cancel.abort();
    await expect(pending).resolves.toEqual({ miss: "cancelled" });
    expect(signal?.aborted).toBe(true);
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test("an already-cancelled call never runs", async () => {
    const run = vi.fn(async () => "Weekly sales summary");
    const cancel = new AbortController();
    cancel.abort();
    await expect(
      runMissionTitle("c1", REQ, run, 10_000, { cancel: cancel.signal }),
    ).resolves.toEqual({ miss: "cancelled" });
    expect(run).not.toHaveBeenCalled();
  });
});

test("the cap counts from capStart, not from the call", async () => {
  vi.useFakeTimers();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  let signal: AbortSignal | undefined;
  const run = (_excerpt: string, s: AbortSignal) => {
    signal = s;
    return new Promise<string>(() => {});
  };
  let startCap: () => void = () => undefined;
  const capStart = new Promise<void>((resolve) => {
    startCap = resolve;
  });
  const pending = runMissionTitle("c1", REQ, run, 10_000, { capStart });
  await vi.advanceTimersByTimeAsync(30_000);
  expect(signal?.aborted).toBe(false);
  startCap();
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(pending).resolves.toEqual({ miss: "timeout" });
  expect(signal?.aborted).toBe(true);
  expect(warn).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

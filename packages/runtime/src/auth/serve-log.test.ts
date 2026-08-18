import { beforeEach, expect, test, vi } from "vitest";
import {
  logServeProbeFailure,
  logServeSweepFailure,
  noteServeProbeOk,
  noteServeSweepOk,
  resetServeProbeLog,
} from "./serve-log";

let error: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetServeProbeLog();
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});

test("the first failure logs an error; identical repeats demote to warnings", () => {
  logServeProbeFailure("anthropic", "502: credential expired");
  logServeProbeFailure("anthropic", "502: credential expired");
  logServeProbeFailure("anthropic", "502: credential expired");
  expect(error).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledTimes(2);
});

test("a CHANGED failure detail logs a fresh error", () => {
  logServeProbeFailure("anthropic", "502: credential expired");
  logServeProbeFailure("anthropic", "fetch failed");
  expect(error).toHaveBeenCalledTimes(2);
});

test("failures dedup per provider, not globally", () => {
  logServeProbeFailure("anthropic", "502: credential expired");
  logServeProbeFailure("openai-codex", "502: credential expired");
  expect(error).toHaveBeenCalledTimes(2);
});

test("recovery logs once and re-arms the error for the next incident", () => {
  logServeProbeFailure("anthropic", "502: credential expired");
  noteServeProbeOk("anthropic");
  expect(info).toHaveBeenCalledWith("[serve] credential anthropic recovered");
  logServeProbeFailure("anthropic", "502: credential expired");
  expect(error).toHaveBeenCalledTimes(2);
});

test("a clean probe with no prior failure stays silent", () => {
  noteServeProbeOk("anthropic");
  expect(info).not.toHaveBeenCalled();
});

test("a uniformly failed sweep is ONE incident: one error, warnings on repeat, one recovery line", () => {
  logServeSweepFailure(41, "fetch failed (cause: ECONNREFUSED)");
  logServeSweepFailure(41, "fetch failed (cause: ECONNREFUSED)");
  expect(error).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledWith(
    "[serve] control plane unreachable for all 41 providers: fetch failed (cause: ECONNREFUSED)",
  );
  expect(warn).toHaveBeenCalledOnce();
  noteServeSweepOk();
  expect(info).toHaveBeenCalledWith("[serve] control plane reachable again");
  noteServeSweepOk(); // silent without a prior incident
  expect(info).toHaveBeenCalledOnce();
});

test("the sweep incident is tracked apart from per-provider failures", () => {
  logServeSweepFailure(41, "fetch failed (cause: ECONNREFUSED)");
  logServeProbeFailure("anthropic", "fetch failed (cause: ECONNREFUSED)");
  expect(error).toHaveBeenCalledTimes(2);
  noteServeProbeOk("anthropic");
  expect(info).toHaveBeenCalledWith("[serve] credential anthropic recovered");
  expect(info).not.toHaveBeenCalledWith(
    "[serve] control plane reachable again",
  );
});

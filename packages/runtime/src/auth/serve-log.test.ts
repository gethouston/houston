import { beforeEach, expect, test, vi } from "vitest";
import {
  logServeProbeFailure,
  logServeProbeFailures,
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

test("probes failing ALIKE in one sweep are ONE incident, not one per provider (PRODUCT-1423)", () => {
  const blip = '500: {"error":"fetch failed"}';
  logServeProbeFailures([
    { id: "google", detail: blip },
    { id: "openrouter", detail: blip },
    { id: "opencode-go", detail: blip },
  ]);
  expect(error).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledWith(
    `[serve] credential probes for google, openrouter, opencode-go failed alike: ${blip}`,
  );
  // The identical repeat — in any grouping — is a warning, never a new event.
  logServeProbeFailures([
    { id: "google", detail: blip },
    { id: "openrouter", detail: blip },
    { id: "opencode-go", detail: blip },
  ]);
  logServeProbeFailures([{ id: "google", detail: blip }]);
  expect(error).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledTimes(2);
});

test("a group with any NEWLY failing member logs a fresh error, and recovery re-arms it", () => {
  const blip = '500: {"error":"fetch failed"}';
  logServeProbeFailures([
    { id: "google", detail: blip },
    { id: "openrouter", detail: blip },
  ]);
  logServeProbeFailures([
    { id: "google", detail: blip },
    { id: "opencode-go", detail: blip },
  ]);
  expect(error).toHaveBeenCalledTimes(2);
  noteServeProbeOk("google");
  noteServeProbeOk("opencode-go");
  logServeProbeFailures([
    { id: "google", detail: blip },
    { id: "opencode-go", detail: blip },
  ]);
  expect(error).toHaveBeenCalledTimes(3);
});

test("distinct failure details stay distinct incidents; a lone failure keeps the per-provider path", () => {
  logServeProbeFailures([
    { id: "google", detail: '500: {"error":"fetch failed"}' },
    { id: "openrouter", detail: '500: {"error":"fetch failed"}' },
    { id: "anthropic", detail: "502: credential expired" },
  ]);
  expect(error).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith(
    "[serve] credential anthropic: 502: credential expired",
  );
  // The grouped entry point and the per-provider path share one transition
  // map: the lone failure's identical repeat is the same incident.
  logServeProbeFailure("anthropic", "502: credential expired");
  expect(error).toHaveBeenCalledTimes(2);
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

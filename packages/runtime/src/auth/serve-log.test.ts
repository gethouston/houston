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
  logServeProbeFailure("anthropic", "500: credential row corrupt");
  logServeProbeFailure("anthropic", "500: credential row corrupt");
  logServeProbeFailure("anthropic", "500: credential row corrupt");
  expect(error).toHaveBeenCalledOnce();
  expect(warn).toHaveBeenCalledTimes(2);
});

test("a CHANGED failure detail logs a fresh error", () => {
  logServeProbeFailure("anthropic", "500: credential row corrupt");
  logServeProbeFailure("anthropic", "500: malformed served payload");
  expect(error).toHaveBeenCalledTimes(2);
});

test("failures dedup per provider, not globally", () => {
  logServeProbeFailure("anthropic", "500: credential row corrupt");
  logServeProbeFailure("openai-codex", "500: credential row corrupt");
  expect(error).toHaveBeenCalledTimes(2);
});

test("recovery logs once and re-arms the error for the next incident", () => {
  logServeProbeFailure("anthropic", "500: credential row corrupt");
  noteServeProbeOk("anthropic");
  expect(info).toHaveBeenCalledWith("[serve] credential anthropic recovered");
  logServeProbeFailure("anthropic", "500: credential row corrupt");
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
  const blip = '500: {"error":"credential row corrupt"}';
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
  const blip = '500: {"error":"credential row corrupt"}';
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
    { id: "google", detail: '500: {"error":"credential row corrupt"}' },
    { id: "openrouter", detail: '500: {"error":"credential row corrupt"}' },
    { id: "anthropic", detail: "500: served key rejected" },
  ]);
  expect(error).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith(
    "[serve] credential anthropic: 500: served key rejected",
  );
  // The grouped entry point and the per-provider path share one transition
  // map: the lone failure's identical repeat is the same incident.
  logServeProbeFailure("anthropic", "500: served key rejected");
  expect(error).toHaveBeenCalledTimes(2);
});

test("the sweep incident is tracked apart from per-provider failures", () => {
  logServeSweepFailure(41, "fetch failed (cause: ECONNREFUSED)");
  logServeProbeFailure("anthropic", "500: credential row corrupt");
  expect(error).toHaveBeenCalledTimes(2);
  noteServeProbeOk("anthropic");
  expect(info).toHaveBeenCalledWith("[serve] credential anthropic recovered");
  expect(info).not.toHaveBeenCalledWith(
    "[serve] control plane reachable again",
  );
});

test("a dead central credential NEVER logs an error (user state, not incident)", () => {
  const detail =
    '500: {"error":"credential gateway GET github-copilot reported a dead credential"}';
  logServeProbeFailure("github-copilot", detail);
  logServeProbeFailure("github-copilot", detail);
  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(2);
  // Reconnecting re-arms the transition tracking like any recovery.
  noteServeProbeOk("github-copilot");
  expect(info).toHaveBeenCalledWith(
    "[serve] credential github-copilot recovered",
  );
});

test("a dead-credential group in a sweep stays at warning level per provider", () => {
  const detail = "500: dead credential";
  logServeProbeFailures([
    { id: "github-copilot", detail },
    { id: "google", detail },
  ]);
  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(2);
});

test("connectivity-class failures NEVER log an error (PRODUCT-1602)", () => {
  const connectivity = [
    '500: {"error":"fetch failed"}',
    "fetch failed (cause: ECONNRESET)",
    "The operation was aborted due to timeout",
    "502: Bad Gateway",
    '500: {"error":"credential gateway GET <provider> failed (500): {\\"error\\":\\"gateway error\\"}"}',
    "fetch failed (cause: UND_ERR_CONNECT_TIMEOUT)",
  ];
  for (const detail of connectivity) logServeProbeFailure("openrouter", detail);
  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(connectivity.length);
  // Recovery still re-arms the transition map like any other failure class.
  noteServeProbeOk("openrouter");
  expect(info).toHaveBeenCalledWith("[serve] credential openrouter recovered");
});

test("a connectivity group in a sweep stays at warning level per provider (PRODUCT-1602)", () => {
  const detail = '500: {"error":"fetch failed"}';
  logServeProbeFailures([
    { id: "google", detail },
    { id: "openrouter", detail },
    { id: "opencode-go", detail },
  ]);
  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledTimes(3);
});

test("a NON-connectivity 500 keeps the error path", () => {
  logServeProbeFailure("openrouter", "500: served key rejected");
  expect(error).toHaveBeenCalledOnce();
});

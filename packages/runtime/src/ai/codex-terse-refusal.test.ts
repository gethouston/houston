import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-terse-"));

const { noteQuotaExhausted, resetAuthFailures } = await import(
  "../auth/credential-health"
);
const {
  isCodexTerseRefusal,
  noteCodexRefusal,
  resetCodexRefusalMemory,
  resolveCodexTerseRefusal,
} = await import("./codex-terse-refusal");

afterEach(() => {
  resetCodexRefusalMemory();
  resetAuthFailures();
  vi.useRealTimers();
});

const BAD_REQUEST = '{"detail":"Bad Request"}';
const GATE =
  '{"detail":"The \'gpt-5.4-mini\' model is not supported when using Codex with a ChatGPT account."}';
const USAGE_LIMIT =
  "You have hit your ChatGPT usage limit (plus plan). Try again in ~7524 min.";

test("recognises every terse shape ChatGPT's gateway answers with", () => {
  expect(isCodexTerseRefusal("openai-codex", BAD_REQUEST)).toBe(true);
  expect(
    isCodexTerseRefusal("openai-codex", '{ "detail" : "Not Found" }'),
  ).toBe(true);
  expect(isCodexTerseRefusal("openai-codex", "Not Found")).toBe(true);
  expect(isCodexTerseRefusal("openai-codex", "Bad Request")).toBe(true);
  expect(
    isCodexTerseRefusal(
      "openai-codex",
      '<html>\n  <head>\n    <meta name="viewport" content="width=device-width" />',
    ),
  ).toBe(true);
});

test("an explained body, another provider, or a structured detail is not terse", () => {
  expect(isCodexTerseRefusal("openai-codex", GATE)).toBe(false);
  expect(
    isCodexTerseRefusal(
      "openai-codex",
      '{"detail":{"code":"deactivated_workspace"}}',
    ),
  ).toBe(false);
  expect(isCodexTerseRefusal("openai", BAD_REQUEST)).toBe(false);
  expect(isCodexTerseRefusal("anthropic", "Not Found")).toBe(false);
  expect(isCodexTerseRefusal("openai-codex", "")).toBe(false);
});

test("nothing remembered → no reading (the turn stays unknown)", () => {
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-5.4-mini",
      message: BAD_REQUEST,
    }),
  ).toBeNull();
});

test("this turn's retry attempt explained the refusal (the usage-limit flavor)", () => {
  const resolved = resolveCodexTerseRefusal({
    provider: "openai-codex",
    model: "gpt-6-astra",
    message: BAD_REQUEST,
    retryErrorMessage: USAGE_LIMIT,
  });
  expect(resolved).toMatchObject({
    kind: "quota_exhausted",
    provider: "openai-codex",
    model: "gpt-6-astra",
  });
  const message = resolved && "message" in resolved ? resolved.message : "";
  expect(message).toContain(BAD_REQUEST);
  expect(message).toContain(USAGE_LIMIT);
});

test("a retry attempt that was itself terse (or a 5xx) vouches for nothing", () => {
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-6-astra",
      message: BAD_REQUEST,
      retryErrorMessage: "Not Found",
    }),
  ).toBeNull();
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-6-astra",
      message: BAD_REQUEST,
      retryErrorMessage: "OpenAI API error (503): overloaded",
    }),
  ).toBeNull();
});

test("a remembered plan gate on the SAME model reads a later terse refusal (the gpt-5.4-mini storm)", () => {
  noteCodexRefusal({
    kind: "model_unavailable",
    provider: "openai-codex",
    model: "gpt-5.4-mini",
    reason: "unknown",
    suggested_fallback: "gpt-6-astra",
    message: GATE,
  });
  const resolved = resolveCodexTerseRefusal({
    provider: "openai-codex",
    model: "gpt-5.4-mini",
    message: BAD_REQUEST,
  });
  expect(resolved).toMatchObject({
    kind: "model_unavailable",
    model: "gpt-5.4-mini",
    suggested_fallback: "gpt-6-astra",
  });
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-6-astra",
      message: BAD_REQUEST,
    }),
  ).toBeNull();
});

test("a remembered usage limit reads a terse refusal on ANY model, until its reset", () => {
  vi.useFakeTimers();
  const resetsAt = new Date(Date.now() + 60_000).toISOString();
  noteCodexRefusal({
    kind: "quota_exhausted",
    provider: "openai-codex",
    model: "gpt-6-astra",
    scope: "unknown",
    resets_at: resetsAt,
    message: USAGE_LIMIT,
  });
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-5.5",
      message: "Not Found",
    }),
  ).toMatchObject({
    kind: "quota_exhausted",
    model: "gpt-5.5",
    resets_at: resetsAt,
  });
  vi.advanceTimersByTime(61_000);
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-5.5",
      message: "Not Found",
    }),
  ).toBeNull();
});

test("a plan-gate memory lapses after its TTL", () => {
  vi.useFakeTimers();
  noteCodexRefusal({
    kind: "model_unavailable",
    provider: "openai-codex",
    model: "gpt-5.4-mini",
    reason: "unknown",
    suggested_fallback: "gpt-6-astra",
    message: GATE,
  });
  vi.advanceTimersByTime(31 * 60 * 1000);
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-5.4-mini",
      message: BAD_REQUEST,
    }),
  ).toBeNull();
});

test("the persisted out-of-quota mark outlives the in-memory reading (pod restart)", () => {
  noteQuotaExhausted("openai-codex", null);
  const resolved = resolveCodexTerseRefusal({
    provider: "openai-codex",
    model: "gpt-6-astra",
    message: BAD_REQUEST,
  });
  expect(resolved).toMatchObject({ kind: "quota_exhausted", resets_at: null });
});

test("refusals from other providers are never remembered", () => {
  noteCodexRefusal({
    kind: "model_unavailable",
    provider: "github-copilot",
    model: "gpt-5.4-mini",
    reason: "unknown",
    suggested_fallback: null,
    message: "model_not_supported",
  });
  expect(
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-5.4-mini",
      message: BAD_REQUEST,
    }),
  ).toBeNull();
});

const { runWithConversationId } = await import(
  "../session/conversation-context"
);

test("the conversation's persisted refusal outlives this process, for half an hour", () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-11-22T10:00:00Z"));
  const dataDir = mkdtempSync(join(tmpdir(), "houston-terse-turn-"));
  const inTurn = <T>(fn: () => T) => runWithConversationId("c1", fn, dataDir);
  inTurn(() =>
    noteCodexRefusal({
      kind: "quota_exhausted",
      provider: "openai-codex",
      model: "gpt-6-astra",
      scope: "unknown",
      resets_at: null,
      message: USAGE_LIMIT,
    }),
  );
  resetCodexRefusalMemory();
  const terse = () =>
    resolveCodexTerseRefusal({
      provider: "openai-codex",
      model: "gpt-5.4-mini",
      message: BAD_REQUEST,
    });
  expect(inTurn(terse)).toMatchObject({
    kind: "quota_exhausted",
    model: "gpt-5.4-mini",
  });
  expect(terse()).toBeNull();
  vi.setSystemTime(Date.parse("2026-11-22T10:31:00Z"));
  expect(inTurn(terse)).toBeNull();
});

test("a persisted refusal of the wrong shape is ignored", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-terse-bad-"));
  mkdirSync(join(dataDir, "sessions", "c1"), { recursive: true });
  writeFileSync(
    join(dataDir, "sessions", "c1", "codex-refusals.json"),
    JSON.stringify({
      "team:quota": { at: Date.now(), error: { kind: "quota_exhausted" } },
    }),
  );
  expect(
    runWithConversationId(
      "c1",
      () =>
        resolveCodexTerseRefusal({
          provider: "openai-codex",
          model: "gpt-5.4-mini",
          message: BAD_REQUEST,
        }),
      dataDir,
    ),
  ).toBeNull();
});

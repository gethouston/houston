import { beforeEach, expect, test, vi } from "vitest";
import {
  noteAuthFailure,
  noteQuotaExhausted,
} from "../../auth/credential-health";
import { classifyText, mapSdkError } from "./errors";
import {
  classifyClaudeRateLimit,
  USAGE_LIMIT_MIN_RETRY_SECONDS,
  usageLimitFromText,
} from "./usage-limit";

vi.mock("../../auth/report-revoked", () => ({
  reportRevokedServedToken: vi.fn(),
}));
vi.mock("../../auth/credential-health", () => ({
  noteAuthFailure: vi.fn(),
  noteQuotaExhausted: vi.fn(),
}));

const NOW = Date.parse("2026-10-08T20:47:27.000Z");
const RESET = "2026-10-13T05:00:00.000Z";
const WEEKLY =
  "You've reached your Fable limit. Switch to another model, or manage usage credits at https://claude.ai/settings/usage?from=cc_cli_limit_message, to continue.";
const SESSION = "You've hit your session limit · resets 6pm (UTC)";

beforeEach(() => {
  vi.mocked(noteQuotaExhausted).mockClear();
  vi.mocked(noteAuthFailure).mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

test("a rejected rate_limit_info is a usage limit with the SDK's reset instant", () => {
  const resetsAt = Date.parse(RESET);
  for (const epoch of [resetsAt, resetsAt / 1000]) {
    expect(
      classifyClaudeRateLimit(
        WEEKLY,
        "claude-fable-5",
        { rateLimit: { status: "rejected", resetsAt: epoch } },
        NOW,
      ),
    ).toEqual({
      kind: "usage_limit_paused",
      provider: "anthropic",
      model: "claude-fable-5",
      resets_at: RESET,
      message: WEEKLY,
    });
  }
});

test("the Claude Code limit sentences are usage limits even without an event", () => {
  expect(classifyClaudeRateLimit(WEEKLY, null, {}, NOW)).toMatchObject({
    kind: "usage_limit_paused",
    resets_at: null,
  });
  expect(classifyClaudeRateLimit(SESSION, null, {}, NOW)).toMatchObject({
    kind: "usage_limit_paused",
    resets_at: null,
  });
  expect(
    usageLimitFromText(
      "You've hit your session limit · resets 6:30pm (UTC)",
      null,
      Date.parse("2026-10-08T16:12:00Z"),
    ),
  ).toMatchObject({ resets_at: "2026-10-08T18:30:00.000Z" });
  expect(
    usageLimitFromText(
      "You've hit your session limit · resets 3pm (Mars/Olympus)",
      null,
      NOW,
    ),
  ).toMatchObject({ resets_at: null });
});

test("a wait longer than any rate limit is a usage limit ending when it says", () => {
  const retry = USAGE_LIMIT_MIN_RETRY_SECONDS + 1;
  expect(
    classifyClaudeRateLimit("429", "m", { retryAfterSeconds: retry }, NOW),
  ).toEqual({
    kind: "usage_limit_paused",
    provider: "anthropic",
    model: "m",
    resets_at: new Date(NOW + retry * 1000).toISOString(),
    message: "429",
  });
});

test("an ordinary 429 stays a rate limit, allowed-with-warning events included", () => {
  expect(
    classifyClaudeRateLimit(
      "429 slow down",
      "m",
      {
        rateLimit: { status: "allowed_warning", resetsAt: NOW / 1000 + 60 },
        retryAfterSeconds: 60,
      },
      NOW,
    ),
  ).toEqual({
    kind: "rate_limited",
    provider: "anthropic",
    model: "m",
    retry_after_seconds: 60,
    message: "429 slow down",
  });
  expect(usageLimitFromText("429 slow down", null, NOW)).toBeNull();
  expect(
    usageLimitFromText("prompt is too long: 250000 tokens > limit", null, NOW),
  ).toBeNull();
});

test("mapSdkError hands rate_limit to the usage-limit classifier without an out-of-credits mark", () => {
  const mapped = mapSdkError("rate_limit", {
    message: WEEKLY,
    model: "claude-fable-5",
    rateLimit: { status: "rejected", resetsAt: Date.parse(RESET) },
  });
  expect(mapped).toMatchObject({
    kind: "usage_limit_paused",
    resets_at: RESET,
  });
  expect(noteQuotaExhausted).not.toHaveBeenCalled();
  expect(noteAuthFailure).not.toHaveBeenCalled();
});

test("a result-path limit sentence classifies the same way", () => {
  const classified = classifyText(WEEKLY, null, null);
  expect(classified).toMatchObject({
    kind: "usage_limit_paused",
    provider: "anthropic",
    resets_at: null,
  });
  expect(noteQuotaExhausted).not.toHaveBeenCalled();
});

test("the CLI's own <synthetic> model names no model the limit applies to", () => {
  expect(
    classifyClaudeRateLimit(
      WEEKLY,
      "<synthetic>",
      { rateLimit: { status: "rejected", resetsAt: Date.parse(RESET) } },
      NOW,
    ),
  ).toMatchObject({
    kind: "usage_limit_paused",
    model: null,
    resets_at: RESET,
  });
});

test("the older CLI's epoch sentence is a usage limit with that reset", () => {
  expect(
    usageLimitFromText("Claude AI usage limit reached|1760331600", "m", NOW),
  ).toMatchObject({
    kind: "usage_limit_paused",
    resets_at: new Date(1760331600 * 1000).toISOString(),
  });
});

test("only Claude Code's own limit shapes are usage limits; spend caps are not", () => {
  for (const text of [
    "You've hit your session limit · resets 6pm (UTC)",
    "You've hit your weekly limit · resets Oct 13, 5am (UTC)",
    "You've reached your Opus limit.",
    "Claude AI usage limit reached|1760331600",
  ])
    expect(usageLimitFromText(text, null, NOW), text).not.toBeNull();
  for (const text of [
    "You've reached your maximum budget limit.",
    "You've reached your monthly spend limit for this organization.",
    "You've hit your spending limit",
    "budget limit exceeded",
    "Rate limit reached for requests",
  ])
    expect(usageLimitFromText(text, null, NOW), text).toBeNull();
});

test("an allowed event's window reset never overrides the sentence's reset", () => {
  const early = Date.parse("2026-10-08T16:12:00Z");
  expect(
    classifyClaudeRateLimit(
      SESSION,
      null,
      {
        rateLimit: {
          status: "allowed_warning",
          resetsAt: Date.parse(RESET) / 1000,
        },
      },
      early,
    ),
  ).toMatchObject({ resets_at: "2026-10-08T18:00:00.000Z" });
});

test("a rejected window reopening within the hour is waited out like a 429", () => {
  expect(
    classifyClaudeRateLimit(
      "429",
      "m",
      {
        rateLimit: { status: "rejected", resetsAt: NOW + 60_000 },
        retryAfterSeconds: 60,
      },
      NOW,
    ),
  ).toMatchObject({ kind: "rate_limited", retry_after_seconds: 60 });
});

test("a rejected window carried past by overage leaves a 429 a plain rate limit", () => {
  const weekAway = Date.parse(RESET) / 1000;
  for (const overage of [
    { isUsingOverage: true },
    { overageStatus: "allowed" },
  ])
    expect(
      classifyClaudeRateLimit(
        "429 Too Many Requests",
        "m",
        { rateLimit: { status: "rejected", resetsAt: weekAway, ...overage } },
        NOW,
      ),
    ).toMatchObject({ kind: "rate_limited", retry_after_seconds: null });
});

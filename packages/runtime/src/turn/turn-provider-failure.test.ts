import type { ProviderError } from "@houston/protocol";
import { expect, test } from "vitest";
import { providerFailureReport } from "./turn-provider-failure";
import { durableTerminalFrame } from "./turn-terminal";

const GONE =
  '410 {"type":"about:blank","title":"Gone","status":410,"detail":"The model \'openai/gpt-oss-20b\' has reached its end of life on 2026-11-18T08:00:00Z and is no longer available."}';

test("an unknown error reports its status and the provider's own error token, never its text", () => {
  const report = providerFailureReport({
    kind: "unknown",
    provider: "nvidia",
    raw_excerpt: GONE,
  });
  expect(report).toEqual({
    kind: "unknown",
    provider: "nvidia",
    status: 410,
    code: "Gone",
  });
  expect(JSON.stringify(report)).not.toContain("gpt-oss");
});

test("the token skips the generic 'error' type and takes the provider's specific one", () => {
  expect(
    providerFailureReport({
      kind: "unknown",
      provider: "anthropic",
      raw_excerpt:
        '404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-x"}}',
    }),
  ).toEqual({
    kind: "unknown",
    provider: "anthropic",
    status: 404,
    code: "not_found_error",
  });
});

test("free text carries no token, and a provider id outside the charset is bounded", () => {
  expect(
    providerFailureReport({
      kind: "unknown",
      provider: "my endpoint <script>",
      raw_excerpt: "Connection error: the user's secret plan was refused",
    }),
  ).toEqual({ kind: "unknown", provider: "other" });
});

test("a long or oddly shaped token never rides the report", () => {
  const long = "x".repeat(80);
  expect(
    providerFailureReport({
      kind: "unknown",
      provider: "nvidia",
      raw_excerpt: `{"code":"${long}","type":"has spaces in it"}`,
    })?.code,
  ).toBeUndefined();
});

test("a typed error reports its kind and the provider_internal status field", () => {
  expect(
    providerFailureReport({
      kind: "provider_internal",
      provider: "anthropic",
      http_status: 529,
      message: "Overloaded",
    }),
  ).toEqual({ kind: "provider_internal", provider: "anthropic", status: 529 });
});

test("the durable terminal frame carries the report beside the timings, and nothing without a provider error", () => {
  const err: ProviderError = {
    kind: "unknown",
    provider: "nvidia",
    raw_excerpt: GONE,
  };
  const durable = (providerError?: ProviderError) => ({
    outcome: providerError ? { providerError } : {},
    poolWritesOutOfScope: 0,
    changed: [],
  });
  const hydration = { hydratedObjects: 1, skippedObjects: 0 };
  const failed = durableTerminalFrame(
    durable(err),
    "t1",
    { t_a: 0 },
    hydration,
  );
  expect(failed).toMatchObject({
    type: "done",
    data: {
      providerFailure: {
        kind: "unknown",
        provider: "nvidia",
        status: 410,
        code: "Gone",
      },
    },
  });
  const ok = durableTerminalFrame(durable(), "t1", { t_a: 0 }, hydration);
  expect(ok.data).not.toHaveProperty("providerFailure");
  expect(providerFailureReport(undefined)).toBeUndefined();
});

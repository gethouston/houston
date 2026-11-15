import type { ProviderError } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { providerErrorReportTags } from "./provider-error-report";

test("an unclassified failure's report carries what its request ran on", () => {
  const error: ProviderError = {
    kind: "unknown",
    provider: "openai-codex",
    raw_excerpt: '{"detail":"Bad Request"}',
    model: "gpt-6-luna",
    effort: "medium",
    http_status: 400,
    request_id: "oai-req-1",
  };
  expect(providerErrorReportTags(error)).toEqual({
    provider_id: "openai-codex",
    provider_model: "gpt-6-luna",
    provider_effort: "medium",
    provider_http_status: "400",
    provider_request_id: "oai-req-1",
  });
});

test("facts the failure path never saw are left out, not blanked", () => {
  const bare: ProviderError = {
    kind: "unknown",
    provider: "anthropic",
    raw_excerpt: "odd",
  };
  const noStatus: ProviderError = {
    kind: "provider_internal",
    provider: "anthropic",
    http_status: null,
    message: "overloaded",
  };
  expect(providerErrorReportTags(bare)).toEqual({ provider_id: "anthropic" });
  expect(providerErrorReportTags(noStatus)).toEqual({
    provider_id: "anthropic",
  });
});

test("the provider's text never becomes a tag", () => {
  const error: ProviderError = {
    kind: "unknown",
    provider: "openai-codex",
    raw_excerpt: "the provider quoted the person's files back",
    credential: { scope: "personal" },
  };
  expect(Object.values(providerErrorReportTags(error)).join(" ")).not.toMatch(
    /files/,
  );
});

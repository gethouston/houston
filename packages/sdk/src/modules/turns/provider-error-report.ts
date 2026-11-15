/**
 * The typed facts a provider error may carry (`ProviderError` in
 * `@houston/runtime-client`, and its card mirror in `@houston-ai/chat`).
 * Structural on purpose, so every surface's copy of the union fits, and this
 * module stays dependency-free: the app's node:test runner loads it through
 * the `@houston/sdk/turns/provider-error-report` subpath.
 */
export interface ProviderErrorFacts {
  provider: string;
  model?: string;
  effort?: string;
  http_status?: number | null;
  request_id?: string;
}

/**
 * The triage tags a bug report filed from a provider error card carries: which
 * provider and model the failed request ran on, its reasoning effort, the HTTP
 * status and the provider's own request id. Tags, never the report's message,
 * so a reader can filter and group by them and the provider can look the
 * request up from its id.
 *
 * Built only from the typed fields, never from `raw_excerpt` or `message`:
 * the provider's text can quote the person's content, and the credential
 * stamp says whose account it was. A fact the failure path never saw is left
 * out rather than sent blank.
 */
export function providerErrorReportTags(
  facts: ProviderErrorFacts,
): Record<string, string> {
  const tags: Record<string, string> = { provider_id: facts.provider };
  if (facts.model) tags.provider_model = facts.model;
  if (facts.effort) tags.provider_effort = facts.effort;
  if (typeof facts.http_status === "number")
    tags.provider_http_status = String(facts.http_status);
  if (facts.request_id) tags.provider_request_id = facts.request_id;
  return tags;
}

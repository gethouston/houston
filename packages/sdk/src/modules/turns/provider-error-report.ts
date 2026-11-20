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

const LINE_PARTS: [key: string, label: string][] = [
  ["provider_id", "provider"],
  ["provider_model", "model"],
  ["provider_effort", "effort"],
  ["provider_http_status", "status"],
  ["provider_request_id", "request id"],
];

/**
 * The same facts as one plain line for the report's issue body
 * (`provider openai-codex · model gpt-6-luna · status 400 · request id …`).
 * Tags alone never show on the intake's issue, so its reader would miss them.
 * Empty when the tags carry none of the facts.
 */
export function providerErrorReportLine(tags: Record<string, string>): string {
  return LINE_PARTS.filter(([key]) => tags[key])
    .map(([key, label]) => `${label} ${tags[key]}`)
    .join(" · ");
}

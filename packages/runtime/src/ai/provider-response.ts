import { AsyncLocalStorage } from "node:async_hooks";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";

/**
 * How the provider answered the current prompt's latest request, captured from
 * pi's `after_provider_response` hook: the HTTP status and the provider's own
 * request id. pi turns an HTTP failure into a bare `errorMessage` string (the
 * Codex SSE path drops the status entirely), so without this a bug report on
 * an unclassified failure carries nothing but the body, and a provider cannot
 * look a `{"detail":"Bad Request"}` up from that.
 *
 * Turn-scoped through `AsyncLocalStorage` for the duration of
 * `session.prompt()`, like `auth/used-token.ts`: the hook runs inside pi's
 * request, inside that async subtree, so concurrent prompts never read each
 * other's response. Outside a prompt recording is a no-op.
 */
export interface ProviderResponseFacts {
  status: number;
  requestId?: string;
}

interface Holder {
  last?: ProviderResponseFacts;
}

const store = new AsyncLocalStorage<Holder>();

/** Run `fn` (a prompt) with a fresh response record. */
export function runWithProviderResponseCapture<T>(fn: () => T): T {
  return store.run({}, fn);
}

/**
 * Header names that carry a provider's request id, most specific first.
 * `cf-ray` is Cloudflare's id for the same request, the fallback when the
 * provider names none of its own. pi lowercases the header record.
 */
const REQUEST_ID_HEADERS = [
  "x-oai-request-id",
  "x-request-id",
  "request-id",
  "x-amzn-requestid",
  "cf-ray",
];

/**
 * The pi extension that feeds the record. A new request clears it first, so a
 * failure on a transport that reports no response (Codex's WebSocket) never
 * inherits an earlier request's status.
 */
export function makeProviderResponseRecorder(): ExtensionFactory {
  return (pi) => {
    pi.on("before_provider_request", () => {
      const holder = store.getStore();
      if (holder) holder.last = undefined;
      return undefined;
    });
    pi.on("after_provider_response", (event) => {
      const holder = store.getStore();
      if (!holder) return;
      const requestId = REQUEST_ID_HEADERS.map((h) => event.headers[h]).find(
        Boolean,
      );
      holder.last = { status: event.status, ...(requestId && { requestId }) };
    });
  };
}

/** The current prompt's latest response, when it was an HTTP failure. */
export function currentFailedResponse(): ProviderResponseFacts | undefined {
  const last = store.getStore()?.last;
  return last && last.status >= 400 ? last : undefined;
}

/**
 * A request id the provider wrote into its error body: Anthropic's JSON
 * `request_id`, or a bare `req_…` token in a formatted message.
 */
export function requestIdFromBody(body: string): string | undefined {
  return (
    /"request_id"\s*:\s*"([^"\s]{1,128})"/.exec(body)?.[1] ??
    /\b(req_[A-Za-z0-9]{8,128})\b/.exec(body)?.[1]
  );
}

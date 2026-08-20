import {
  type TranscriptTurnWrite,
  transcriptTurnRequest,
} from "@houston/runtime-client";
import { fetchWithRetry } from "@houston/runtime-client/object-sync";
import type { TranscriptOptions } from "./turn-transcript";

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * One claim-authorized transcript PUT against the pod store. Transient
 * 502/503/504 and network drops retry (the routes are idempotent per turnId)
 * with a FRESH timeout per attempt: a reused timed-out signal would abort
 * every retry on arrival. The caller interprets the status; the body is
 * released here because it is never needed.
 */
export async function putTranscriptRow(
  fetchImpl: typeof fetch,
  opts: TranscriptOptions,
  write: TranscriptTurnWrite,
): Promise<Response> {
  const root = opts.baseUrl.replace(/\/+$/, "");
  const conversationUrl = `${root}/v1/pod/transcripts/${encodeURIComponent(
    opts.org,
  )}/${encodeURIComponent(opts.agent)}/conversations/${encodeURIComponent(
    opts.conversationId,
  )}`;
  const request = transcriptTurnRequest(conversationUrl, write);
  const response = await fetchWithRetry(
    (url, init) =>
      fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    request.url,
    {
      method: request.method,
      headers: {
        Authorization: `Bearer ${opts.hostToken}`,
        "Content-Type": "application/json",
        "X-Houston-Claim-Token": opts.claim.token,
        "X-Houston-Claim-Boot": opts.claim.bootId,
      },
      body: JSON.stringify(request.body),
    },
    opts.retryDelaysMs ? { delaysMs: opts.retryDelaysMs } : {},
  );
  await response.body?.cancel();
  return response;
}

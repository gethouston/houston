import type { PushReport } from "@houston/protocol";

const REQUEST_TIMEOUT_MS = 5_000;

export interface PushReporterOptions {
  report: { url: string; orgSlug: string; agentSlug: string; podToken: string };
  fetchImpl?: typeof fetch;
  warn?: (message: string) => void;
  error?: (message: string, cause: unknown) => void;
  retryDelaysMs?: number[];
  maxAttempts?: number;
  requestTimeoutMs?: number;
}

export type PushReporter = (
  report: PushReport,
  actingAs?: string,
) => Promise<void>;

/** Push is advisory: every failure is reported locally and never fails a turn. */
export function createPushReporter(opts: PushReporterOptions): PushReporter {
  const { url, orgSlug, agentSlug, podToken } = opts.report;
  const target = `${url.replace(/\/+$/, "")}/v1/pod/push/${encodeURIComponent(orgSlug)}/${encodeURIComponent(agentSlug)}`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const warn = opts.warn ?? console.warn;
  const error = opts.error ?? console.error;
  const delays = opts.retryDelaysMs ?? [200, 400];
  const maxAttempts = opts.maxAttempts ?? 3;
  const requestTimeoutMs = opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let refusalWarned = false;
  let contractErrorReported = false;
  return async (report, actingAs) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetchImpl(target, {
          method: "POST",
          headers: {
            authorization: `Bearer ${podToken}`,
            "content-type": "application/json",
            ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
          },
          body: JSON.stringify(report),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        await response.body?.cancel();
        if (response.ok) return;
        if (
          response.status === 401 ||
          response.status === 404 ||
          response.status === 503
        ) {
          if (!refusalWarned) {
            refusalWarned = true;
            warn(
              `[push] gateway answered ${response.status}; later refusals stay quiet`,
            );
          }
          return;
        }
        if (response.status < 500) {
          if (!contractErrorReported) {
            contractErrorReported = true;
            error(
              "[push] gateway refused report",
              new Error(`status ${response.status}`),
            );
          }
          return;
        }
        if (attempt === maxAttempts - 1) {
          warn(
            `[push] gateway answered ${response.status} after ${maxAttempts} attempts`,
          );
          return;
        }
      } catch (cause) {
        if (attempt === maxAttempts - 1) {
          warn(
            `[push] send failed after ${maxAttempts} attempts: ${cause instanceof Error ? cause.message : String(cause)}`,
          );
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt] ?? 0));
    }
  };
}

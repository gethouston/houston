import type { BootTelemetry } from "./boot";

const RETRY_DELAY_MS = 5_000;

export interface BootReportOptions {
  /** Managed-pod gateway quadruple (same env as usage reporting). */
  report: { url: string; orgSlug: string; agentSlug: string; podToken: string };
  telemetry: BootTelemetry;
  /** Failure → stderr (Sentry breadcrumb), success → info. Never throws. */
  log: (message: string, err?: unknown) => void;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

/**
 * Push the boot-span ledger to the gateway once, right after this pod became
 * ready (HOU-1011). Pods scale to zero, so Prometheus never scrapes a boot —
 * the gateway folds these reports into its own /metrics histograms instead.
 *
 * Failure posture (mirrors the usage sampler's fire-and-forget): a lost report
 * costs one data point, never the boot. Transient failures (network, 5xx) get
 * ONE retry; only the final give-up is an error entry (a Sentry event) and it
 * names the real cause — the per-attempt failures are breadcrumbs, otherwise
 * every gateway roll fired an error per pod for a blip the retry then healed
 * (PRODUCT-1405). Deterministic rejections (other 4xx) are never retried.
 *
 * Deploy-order tolerance: an older gateway that doesn't mount the ingest yet
 * answers from its authenticated not-found fallback, and a pod bearer is not a
 * user session — so "no route" surfaces as 401, not 404 (HOUSTON-APP-559:
 * 104 pods × 2 attempts in the 40s between the engine roll and the gateway
 * roll). Both mean "nothing to report to" and neither heals in a 5s retry, so
 * both skip quietly. A real pod-token mismatch is not hidden by this: the same
 * token is exercised loudly by every other pod route (credentials, usage,
 * turnlog) on the same boot.
 */
export async function sendBootReport(opts: BootReportOptions): Promise<void> {
  const { url, orgSlug, agentSlug, podToken } = opts.report;
  const target = `${url.replace(/\/+$/, "")}/v1/pod/boot-report/${encodeURIComponent(orgSlug)}/${encodeURIComponent(agentSlug)}`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = JSON.stringify(opts.telemetry.reportPayload());
  let lastFailure = "unknown";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0)
      await new Promise((r) =>
        setTimeout(r, opts.retryDelayMs ?? RETRY_DELAY_MS),
      );
    try {
      const res = await fetchImpl(target, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${podToken}`,
          "content-type": "application/json",
        },
        body,
      });
      if (res.ok) return;
      if (res.status === 404 || res.status === 401) {
        opts.log(
          `[boot-report] gateway has no ingest yet (${res.status}), skipping`,
        );
        return;
      }
      lastFailure = `status ${res.status}`;
      // Any other 4xx is deterministic (payload rejected) — retrying can't help.
      if (res.status < 500) break;
    } catch (err) {
      lastFailure = describeFetchError(err);
    }
    if (attempt === 0)
      opts.log(`[boot-report] send failed (${lastFailure}), retrying once`);
  }
  opts.log(
    "[boot-report] giving up",
    new Error(`boot report not accepted: ${lastFailure}`),
  );
}

/**
 * undici wraps every network failure in a bare `TypeError: fetch failed` and
 * hides the reason (ECONNREFUSED, EAI_AGAIN, ...) in `cause`; surface it so the
 * give-up entry says what actually happened.
 */
function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause;
  const causeText =
    cause instanceof Error
      ? cause.message
      : cause === undefined
        ? undefined
        : String(cause);
  return causeText ? `${err.message}: ${causeText}` : err.message;
}

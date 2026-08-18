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
 * One retry, then give up loudly: a lost report costs one data point, never
 * the boot (mirrors the usage sampler's fire-and-forget posture).
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
      opts.log("[boot-report] rejected", new Error(`status ${res.status}`));
    } catch (err) {
      opts.log("[boot-report] send failed", err);
    }
  }
  opts.log("[boot-report] giving up after retry", new Error("send failed"));
}

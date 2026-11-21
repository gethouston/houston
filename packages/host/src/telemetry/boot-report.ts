import type { BootTelemetry } from "./boot";

const RETRY_DELAY_MS = 5_000;

export interface BootReportOptions {
  report: { url: string; orgSlug: string; agentSlug: string; podToken: string };
  telemetry: BootTelemetry;
  log: (message: string, err?: unknown) => void;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

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

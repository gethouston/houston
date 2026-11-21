import type { ModelCallReport } from "@houston/protocol";

const REQUEST_TIMEOUT_MS = 5_000;
const SEEN_TURNS_CAP = 512;

export interface ModelCallForwarderOptions {
  report: { url: string; orgSlug: string; agentSlug: string; podToken: string };
  fetchImpl?: typeof fetch;
  warn?: (message: string) => void;
  error?: (message: string, err: unknown) => void;
}

export function createModelCallForwarder(
  opts: ModelCallForwarderOptions,
): (report: ModelCallReport) => void {
  const { url, orgSlug, agentSlug, podToken } = opts.report;
  const target = `${url.replace(/\/+$/, "")}/v1/pod/model-calls/${encodeURIComponent(orgSlug)}/${encodeURIComponent(agentSlug)}`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const error = opts.error ?? ((m: string, e: unknown) => console.error(m, e));
  const seen = new Set<string>();
  let contractErrorReported = false;
  let refusalWarned = false;
  const send = async (report: ModelCallReport): Promise<void> => {
    try {
      const res = await fetchImpl(target, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${podToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      await res.body?.cancel();
      if (res.ok) return;
      if (res.status === 401 || res.status === 404) {
        if (refusalWarned) return;
        refusalWarned = true;
        warn(
          `[model-calls] gateway answered ${res.status} (no ingest yet, or the pod token was refused); later refusals stay quiet`,
        );
        return;
      }
      if (res.status >= 500) {
        warn(`[model-calls] gateway answered ${res.status}; sample lost`);
        return;
      }
      if (contractErrorReported) return;
      contractErrorReported = true;
      error(
        "[model-calls] gateway refused the report",
        new Error(`model-call report rejected: status ${res.status}`),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      warn(`[model-calls] send failed (${detail}); sample lost`);
    }
  };
  return (report) => {
    if (seen.has(report.turnId)) return;
    seen.add(report.turnId);
    if (seen.size > SEEN_TURNS_CAP) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    void send(report);
  };
}

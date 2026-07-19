/**
 * Serve-probe failure log dedup. A failing central credential (a gateway 502,
 * a control-plane blip) is re-probed by EVERY hydrating route and every turn,
 * so logging each repeat at error level turned one incident into hundreds of
 * Sentry events (HOUSTON-APP-4XG and its six sibling groupings). Only a
 * TRANSITION logs as an error — the first failure, or a failure whose detail
 * changed; identical repeats demote to warning breadcrumbs, and recovery is
 * logged so an incident's span is readable from the log alone.
 */
const lastFailureDetail = new Map<string, string>();

export function logServeProbeFailure(provider: string, detail: string): void {
  if (lastFailureDetail.get(provider) === detail) {
    console.warn(`[serve] credential ${provider} still failing: ${detail}`);
    return;
  }
  lastFailureDetail.set(provider, detail);
  console.error(`[serve] credential ${provider}: ${detail}`);
}

/** Called when a probe answers cleanly (served or authoritative not-connected). */
export function noteServeProbeOk(provider: string): void {
  if (lastFailureDetail.delete(provider))
    console.info(`[serve] credential ${provider} recovered`);
}

/** Test seam: the dedup state is module-global, one runtime process = one serve loop. */
export function resetServeProbeLog(): void {
  lastFailureDetail.clear();
}

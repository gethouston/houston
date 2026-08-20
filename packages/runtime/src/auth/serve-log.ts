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

/**
 * Dedup key for a sweep in which EVERY probe failed the same way. That is not
 * N provider incidents, it is one: the control plane itself is unreachable
 * (a host mid-shutdown, a gateway outage), and logging it once per provider
 * turned each such sweep into 41 Sentry events (PRODUCT-1399).
 */
const SWEEP_KEY = "*";

export function logServeProbeFailure(provider: string, detail: string): void {
  if (lastFailureDetail.get(provider) === detail) {
    console.warn(`[serve] credential ${provider} still failing: ${detail}`);
    return;
  }
  lastFailureDetail.set(provider, detail);
  console.error(`[serve] credential ${provider}: ${detail}`);
}

/**
 * A whole sweep failed identically: one error for the incident (deduped like a
 * provider's), the per-provider details staying out of Sentry. Callers pass
 * every probe's shared detail; a sweep that recovers or fails unevenly goes
 * back through the per-provider path.
 */
export function logServeSweepFailure(count: number, detail: string): void {
  const line = `control plane unreachable for all ${count} providers: ${detail}`;
  if (lastFailureDetail.get(SWEEP_KEY) === detail) {
    console.warn(`[serve] ${line} (still failing)`);
    return;
  }
  lastFailureDetail.set(SWEEP_KEY, detail);
  console.error(`[serve] ${line}`);
}

/**
 * A non-uniform sweep's failures, collapsed by shared detail. SEVERAL probes
 * failing the SAME way in one sweep is still one incident, not one per
 * provider: a control-plane blip seen through the gateway answers
 * `500: {"error":"fetch failed"}` to exactly the probes in flight during the
 * window (PRODUCT-1423) — the partial-sweep sibling of logServeSweepFailure.
 * A detail only one provider hit stays that provider's own incident. Dedup
 * rides the per-provider transition map, so a group repeats as a warning and
 * each member's recovery re-arms it.
 */
export function logServeProbeFailures(
  failures: ReadonlyArray<{ id: string; detail: string }>,
): void {
  const byDetail = new Map<string, string[]>();
  for (const f of failures) {
    const ids = byDetail.get(f.detail);
    if (ids) ids.push(f.id);
    else byDetail.set(f.detail, [f.id]);
  }
  for (const [detail, ids] of byDetail) {
    const lone = ids.length === 1 ? ids[0] : undefined;
    if (lone !== undefined) {
      logServeProbeFailure(lone, detail);
      continue;
    }
    const group = `credential probes for ${ids.join(", ")}`;
    if (ids.every((id) => lastFailureDetail.get(id) === detail)) {
      console.warn(`[serve] ${group} still failing: ${detail}`);
      continue;
    }
    for (const id of ids) lastFailureDetail.set(id, detail);
    console.error(`[serve] ${group} failed alike: ${detail}`);
  }
}

/** Called after any sweep that did NOT fail uniformly (some probe answered). */
export function noteServeSweepOk(): void {
  if (lastFailureDetail.delete(SWEEP_KEY))
    console.info("[serve] control plane reachable again");
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

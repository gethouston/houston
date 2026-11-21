const lastFailureDetail = new Map<string, string>();

const SWEEP_KEY = "*";

const EXPECTED_DETAIL = /dead credential/;

const CONNECTIVITY_DETAIL =
  /fetch failed|gateway error|operation was aborted|credential gateway GET .* failed|^50[234]: |\(cause: (?:ECONN|ETIMEDOUT|EAI_AGAIN|EPIPE|ENETUNREACH|EHOSTUNREACH|UND_ERR_)/;

export function logServeProbeFailure(provider: string, detail: string): void {
  if (EXPECTED_DETAIL.test(detail)) {
    lastFailureDetail.set(provider, detail);
    console.warn(
      `[serve] credential ${provider} dead centrally (user reconnect required): ${detail}`,
    );
    return;
  }
  if (CONNECTIVITY_DETAIL.test(detail)) {
    lastFailureDetail.set(provider, detail);
    console.warn(
      `[serve] credential ${provider} unreachable (connectivity, next sync retries): ${detail}`,
    );
    return;
  }
  if (lastFailureDetail.get(provider) === detail) {
    console.warn(`[serve] credential ${provider} still failing: ${detail}`);
    return;
  }
  lastFailureDetail.set(provider, detail);
  console.error(`[serve] credential ${provider}: ${detail}`);
}

export function logServeSweepFailure(count: number, detail: string): void {
  const line = `control plane unreachable for all ${count} providers: ${detail}`;
  if (lastFailureDetail.get(SWEEP_KEY) === detail) {
    console.warn(`[serve] ${line} (still failing)`);
    return;
  }
  lastFailureDetail.set(SWEEP_KEY, detail);
  console.error(`[serve] ${line}`);
}

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
    if (
      lone !== undefined ||
      EXPECTED_DETAIL.test(detail) ||
      CONNECTIVITY_DETAIL.test(detail)
    ) {
      for (const id of ids) logServeProbeFailure(id, detail);
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

export function noteServeSweepOk(): void {
  if (lastFailureDetail.delete(SWEEP_KEY))
    console.info("[serve] control plane reachable again");
}

export function noteServeProbeOk(provider: string): void {
  if (lastFailureDetail.delete(provider))
    console.info(`[serve] credential ${provider} recovered`);
}

export function resetServeProbeLog(): void {
  lastFailureDetail.clear();
}

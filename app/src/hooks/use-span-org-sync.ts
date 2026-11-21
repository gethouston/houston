import { useLayoutEffect } from "react";
import type { PerfSpans } from "../lib/perf-spans";

export function useSpanOrgSync(
  orgSlug: string | null,
  spans: Pick<PerfSpans, "setOrgSlug">,
): void {
  useLayoutEffect(() => {
    spans.setOrgSlug(orgSlug);
    return () => spans.setOrgSlug(null);
  }, [orgSlug, spans]);
}

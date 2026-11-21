import { subscribeFirstResponses } from "@houston/engine-adapter";
import { useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import { bakedUrl } from "../lib/baked-url";
import { osIsTauri, osLaunchT0Ms } from "../lib/os-bridge";
import {
  perfSpanEventProps,
  perfSpanNeedsMemberships,
  perfSpanOrgSlug,
} from "../lib/perf-span-mirror";
import {
  type PerfSpanObservation,
  type PerfSpanTransport,
  perfSpans,
} from "../lib/perf-spans";
import { currentPlatformOs, metricsPlatform } from "../lib/platform";
import { useWorkspaceStore } from "../stores/workspaces";
import { useOrgs } from "./queries/use-spaces";
import { useCapabilities } from "./use-capabilities";
import { useSession } from "./use-session";
import { useSpanOrgSync } from "./use-span-org-sync";

const CLIENT_METRICS_URL = bakedUrl(
  import.meta.env?.VITE_CLIENT_METRICS_GATEWAY_URL as string | undefined,
);

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export function usePerfSpans(): void {
  usePerfSpanOrgSlug();
  const { data: session } = useSession();
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.idToken ?? null;

  useEffect(() => {
    void osLaunchT0Ms().then((t0) => {
      if (t0 !== null) perfSpans.setLaunchT0(t0);
    });
    const transport: PerfSpanTransport = {
      mirror(span, ms, tags) {
        analytics.track("perf_span", perfSpanEventProps(span, ms, tags));
      },
    };
    const ingest = CLIENT_METRICS_URL;
    const platform = metricsPlatform(osIsTauri(), currentPlatformOs);
    if (ingest) {
      transport.send = async (spans: PerfSpanObservation[]) => {
        const token = tokenRef.current;
        if (!token) throw new Error("session not ready");
        const res = await fetch(`${ingest}/v1/client-metrics`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            spans: spans.map((s) => ({
              ...s,
              platform,
              appVersion: APP_VERSION,
            })),
          }),
        });
        if (!res.ok && res.status !== 404)
          throw new Error(`client-metrics rejected: ${res.status}`);
      };
    }
    perfSpans.configure(transport);
    const offResponses = subscribeFirstResponses(({ response }) =>
      perfSpans.turnResponded(response),
    );
    const onHide = () => {
      if (document.visibilityState === "hidden") void perfSpans.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      offResponses();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  const token = session?.idToken ?? null;
  useEffect(() => {
    if (token) void perfSpans.flush();
  }, [token]);
}

function usePerfSpanOrgSlug(): void {
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const { data: orgs } = useOrgs(
    perfSpanNeedsMemberships(capabilities, workspaceId),
    { refetchOnWindowFocus: false },
  );
  useSpanOrgSync(perfSpanOrgSlug(capabilities, workspaceId, orgs), perfSpans);
}

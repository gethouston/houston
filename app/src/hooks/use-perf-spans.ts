import { subscribeFirstResponses } from "@houston/engine-adapter";
import { useEffect, useRef } from "react";
import { analytics } from "../lib/analytics";
import { bakedUrl } from "../lib/baked-url";
import { osIsTauri, osLaunchT0Ms } from "../lib/os-bridge";
import { createPerfSpanSend, liveIngestGateway } from "../lib/perf-span-ingest";
import {
  perfSpanEventProps,
  perfSpanNeedsMemberships,
  perfSpanOrgSlug,
} from "../lib/perf-span-mirror";
import { type PerfSpanTransport, perfSpans } from "../lib/perf-spans";
import { currentPlatformOs, metricsPlatform } from "../lib/platform";
import { useWorkspaceStore } from "../stores/workspaces";
import { useOrgs } from "./queries/use-spaces";
import { useCapabilities } from "./use-capabilities";
import { useSession } from "./use-session";
import { useSpanOrgSync } from "./use-span-org-sync";

/**
 * Where client perf spans land: the gateway's `/v1/client-metrics` ingest
 * (session-authed; the gateway folds them into Prometheus histograms). Same
 * target in local-sidecar AND gateway-fronted modes — the route is
 * gateway-owned, never proxied to a pod.
 *
 * Baked at build time (`VITE_CLIENT_METRICS_GATEWAY_URL`), never a literal:
 * see {@link bakedUrl}. `undefined` means this build has no ingest, so we
 * install a mirror-only transport instead of posting at a guessed host.
 */
const CLIENT_METRICS_URL = bakedUrl(
  import.meta.env?.VITE_CLIENT_METRICS_GATEWAY_URL as string | undefined,
);

const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

/**
 * Wires the perf-span singleton (HOU-1011): upgrades T0 to the Tauri shell's
 * process-start stamp, and installs the transport once a session exists —
 * signed-out installs keep measuring but only mirror to PostHog (the gateway
 * ingest requires a user). Mount once in `<App/>`, like the other one-shot
 * app-level subscribers.
 */
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
    if (CLIENT_METRICS_URL)
      transport.send = createPerfSpanSend({
        gateway: liveIngestGateway(
          CLIENT_METRICS_URL,
          () => tokenRef.current ?? undefined,
        ),
        platform: metricsPlatform(osIsTauri(), currentPlatformOs),
        appVersion: APP_VERSION,
      });
    perfSpans.configure(transport);
    // Every turn the client sends reports its first response (paired to that
    // turn by the SDK), whichever surface sent it.
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

  // Session arrived after early spans were measured (the common cold-start
  // order): drain the re-queued batches now instead of waiting for the next
  // observation to schedule a flush.
  const token = session?.idToken ?? null;
  useEffect(() => {
    if (token) void perfSpans.flush();
  }, [token]);
}

/**
 * Keeps the spans' org slug on the active space. Only a settled hosted
 * personal space reads the memberships list to name its org, through the
 * `useOrgs` query the sidebar's invite inbox shares, and without focus
 * refetches of its own (the personal org never changes under a session).
 */
function usePerfSpanOrgSlug(): void {
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const { data: orgs } = useOrgs(
    perfSpanNeedsMemberships(capabilities, workspaceId),
    { refetchOnWindowFocus: false },
  );
  useSpanOrgSync(perfSpanOrgSlug(capabilities, workspaceId, orgs), perfSpans);
}

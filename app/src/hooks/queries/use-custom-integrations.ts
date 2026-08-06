import type {
  AddCustomIntegrationInput,
  CustomIntegrationView,
} from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsSupported } from "../../components/integrations/model";
import { analytics } from "../../lib/analytics";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import { useAgentStore } from "../../stores/agents";
import { useCapabilities } from "../use-capabilities";

/**
 * HOU-550 / HOU-980: the user's custom (API / MCP) integrations. User-level
 * data (one list, shared across agents), gated on the `integrations`
 * capability so an integrations-off deployment never fetches.
 *
 * Reads are `... | null`: `null` means the host answered 404 = the feature is
 * unsupported (an old build or a gateway-fronted pod on that surface), which
 * callers render as "hide the custom UI" rather than an empty list.
 *
 * The mutations carry no `onError`: every write routes through a
 * `tauriIntegrations.*` wrapper built on `call()`, which toasts the real error
 * AND captures it to Sentry exactly once before re-throwing. An `onError` here
 * would double-toast.
 *
 * `agentId` on the mutations/reads switches to the per-agent surface
 * (HOU-823) — REQUIRED wherever a gateway may front the host (the per-agent
 * Integrations tab, the in-chat credential card): the gateway proxies ONLY
 * per-agent routes to the pod, so the top-level form 404s there.
 */

/**
 * The transport agent for user-global custom-integration calls from surfaces
 * WITHOUT an ambient agent (the global Integrations page, chat brand
 * resolution). The hosted gateway proxies ONLY the per-agent custom routes
 * (HOU-823) — the top-level form 404s there and the surface would silently
 * hide — and the data is user-global, so any agent's form returns the same
 * list: ride the first agent's. The top-level fallback covers a direct host
 * with no agents yet.
 */
export function useCustomTransportAgentId(agentId?: string) {
  const firstAgentId = useAgentStore((s) => s.agents[0]?.id);
  return agentId ?? firstAgentId;
}

/** The SAME list through the per-agent surface (HOU-823). Same `staleTime`
 *  as the other observers of this key — mixed options on one cache entry
 *  would make refetch behavior depend on which surface mounted first. */
export function useAgentCustomIntegrations(agentId: string) {
  const { capabilities } = useCapabilities();
  return useQuery<CustomIntegrationView[] | null>({
    queryKey: queryKeys.agentCustomIntegrations(agentId),
    queryFn: () => tauriIntegrations.customListForAgent(agentId),
    enabled: integrationsSupported(capabilities),
    staleTime: 30_000,
  });
}

/** ONE list hook for surfaces that may or may not be per-agent: with an
 *  `agentId` it rides the per-agent form (the only one a gateway proxies),
 *  without it the top-level form. Same data either way (user-global). */
export function useCustomIntegrationsFor(agentId?: string) {
  const { capabilities } = useCapabilities();
  return useQuery<CustomIntegrationView[] | null>({
    queryKey: agentId
      ? queryKeys.agentCustomIntegrations(agentId)
      : queryKeys.customIntegrations(),
    queryFn: () =>
      agentId
        ? tauriIntegrations.customListForAgent(agentId)
        : tauriIntegrations.customList(),
    enabled: integrationsSupported(capabilities),
    staleTime: 30_000,
  });
}

/** Both reads (top-level + every per-agent copy) share this prefix, and the
 *  merged connections view lists custom rows too — refresh both. */
function invalidateCustom(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.customIntegrations() });
  qc.invalidateQueries({
    queryKey: queryKeys.integrationConnections("custom"),
  });
}

/** Remove a custom integration entirely (definition + secret + tools). */
export function useRemoveCustomIntegration(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) =>
      agentId
        ? tauriIntegrations.customRemoveForAgent(agentId, slug)
        : tauriIntegrations.customRemove(slug),
    onSuccess: () => invalidateCustom(qc),
  });
}

/**
 * Provide the secret for a `pending` custom integration. Returns the refreshed
 * view so a caller can read the new `active` state and the advisory
 * `verified` verdict.
 */
export function useSubmitCustomCredential(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      values,
    }: {
      slug: string;
      values: Record<string, string>;
    }) =>
      agentId
        ? tauriIntegrations.customCredentialForAgent(agentId, slug, values)
        : tauriIntegrations.customCredential(slug, values),
    onSuccess: () => invalidateCustom(qc),
  });
}

/**
 * Start the browser sign-in for an OAuth custom integration (PRODUCT-1172):
 * mint the authorize URL and open it. The outcome lands on the host's
 * callback and arrives here as a `CustomIntegrationsChanged` event, which
 * flips the row to active — no client-side poll. Failures toast via the
 * `call()` wrapper.
 */
export function useStartCustomOAuth(agentId?: string) {
  return useMutation({
    mutationFn: async (slug: string) => {
      const { authorizeUrl } = await tauriIntegrations.customOAuthStart(
        slug,
        agentId,
      );
      await tauriSystem.openUrl(authorizeUrl);
    },
    onSuccess: (_data, slug) => {
      analytics.track("custom_integration_oauth_started", {
        integration_slug: slug,
      });
    },
  });
}

/** Classify a pasted URL (OpenAPI / MCP / unknown) — the manual add form's
 *  pre-check. `unknown` is a normal result; only transport failures reject.
 *  `agentId` is the transport agent, so the probe rides the per-agent route
 *  the hosted gateway proxies. */
export function useDetectCustomIntegration(agentId?: string) {
  return useMutation({
    mutationFn: (url: string) => tauriIntegrations.customDetect(url, agentId),
  });
}

/** Register a custom integration from the manual add form. The host compiles
 *  it first — a rejected add (bad URL, duplicate name) never persists. The
 *  returned view is SEEDED into both list caches before the invalidation, so
 *  the new row (and the key dialog a `pending` add chains into) appears
 *  immediately instead of waiting on the refetch round-trip. */
export function useAddCustomIntegration(agentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCustomIntegrationInput) =>
      tauriIntegrations.customAdd(input, agentId),
    onSuccess: (view) => {
      analytics.track("custom_integration_added", {
        integration_slug: view.slug,
        integration_kind: view.kind,
      });
      const append = (old: CustomIntegrationView[] | null | undefined) =>
        old == null ? old : [...old.filter((i) => i.slug !== view.slug), view];
      qc.setQueryData<CustomIntegrationView[] | null>(
        queryKeys.customIntegrations(),
        append,
      );
      if (agentId) {
        qc.setQueryData<CustomIntegrationView[] | null>(
          queryKeys.agentCustomIntegrations(agentId),
          append,
        );
      }
      invalidateCustom(qc);
    },
  });
}

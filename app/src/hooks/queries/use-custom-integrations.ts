import type {
  AddCustomIntegrationInput,
  CustomIntegrationView,
} from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { integrationsSupported } from "../../components/integrations/model";
import { analytics } from "../../lib/analytics";
import { type ReservedTab, reserveBrowserTab } from "../../lib/browser-tab";
import { markCustomOAuthStarted } from "../../lib/custom-oauth-return";
import { startCustomOAuth } from "../../lib/custom-oauth-start";
import { isEngineWakingError } from "../../lib/engine-waking-error";
import { osIsTauri } from "../../lib/os-bridge";
import { queryKeys } from "../../lib/query-keys";
import {
  surfaceEngineError,
  tauriIntegrations,
  tauriSystem,
} from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";

export { useRemoveCustomIntegration } from "./use-remove-custom-integration";

export function useAgentCustomIntegrations(agentId: string) {
  const { capabilities } = useCapabilities();
  return useQuery<CustomIntegrationView[] | null>({
    queryKey: queryKeys.agentCustomIntegrations(agentId),
    queryFn: () => tauriIntegrations.customListForAgent(agentId),
    enabled: integrationsSupported(capabilities),
    staleTime: 30_000,
  });
}

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

function invalidateCustom(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: queryKeys.customIntegrations() });
  qc.invalidateQueries({
    queryKey: queryKeys.integrationConnections("custom"),
  });
}

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

export function claimSignInTab(): ReservedTab | null {
  return osIsTauri() ? null : reserveBrowserTab();
}

export interface StartCustomOAuthVars {
  slug: string;
  tab?: ReservedTab | null;
}

export function useStartCustomOAuth(agentId?: string) {
  return useMutation({
    mutationFn: ({ slug, tab }: StartCustomOAuthVars) =>
      startCustomOAuth({
        mint: () =>
          tauriIntegrations.customOAuthStart(slug, agentId, { surface: false }),
        open: (url) => tauriSystem.openUrl(url),
        tab: tab ?? null,
        isWaking: isEngineWakingError,
        sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
      }).catch((err: unknown) => {
        void surfaceEngineError("custom_integration_oauth_start", err, {
          integration_slug: slug,
        });
        throw err;
      }),
    onSuccess: (outcome, { slug }) => {
      if (!outcome.opened) {
        analytics.track("integration_connect_tab_blocked", {
          integration_slug: slug,
        });
        return;
      }
      markCustomOAuthStarted();
      analytics.track("custom_integration_oauth_started", {
        integration_slug: slug,
      });
    },
  });
}

export function useDetectCustomIntegration(agentId?: string) {
  return useMutation({
    mutationFn: (url: string) => tauriIntegrations.customDetect(url, agentId),
  });
}

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

import type { ProviderError } from "@houston-ai/chat";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../../lib/query-keys";
import { UnauthenticatedCard } from "./provider-error-cards/auth";
import {
  RateLimitedCard,
  UsageLimitPausedCard,
} from "./provider-error-cards/limits";
import { PlanMessageLimitCard } from "./provider-error-cards/plan-limit";
import {
  ContextOverflowCard,
  ModelUnavailableCard,
  QuotaExhaustedCard,
} from "./provider-error-cards/quota";
import {
  SessionResumeMissingCard,
  SpawnFailedCard,
  UnknownErrorCard,
} from "./provider-error-cards/terminal";
import {
  MalformedResponseCard,
  NetworkUnreachableCard,
  ProviderInternalCard,
} from "./provider-error-cards/transient";

interface ProviderErrorCardProps {
  error: ProviderError;
  onRetry?: () => Promise<void> | void;
  onSwitchModel?: () => void;
  onApplyModel?: (model: string) => void;
}

const STATUS_CHANGING_KINDS: ReadonlySet<ProviderError["kind"]> = new Set([
  "unauthenticated",
  "network_unreachable",
]);

export function ProviderErrorCard({
  error,
  onRetry,
  onSwitchModel,
  onApplyModel,
}: ProviderErrorCardProps) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!STATUS_CHANGING_KINDS.has(error.kind)) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.providerStatuses(),
    });
  }, [error.kind, queryClient]);
  useEffect(() => {
    if (error.kind === "plan_message_limit")
      void queryClient.invalidateQueries({ queryKey: queryKeys.orgs() });
  }, [error.kind, queryClient]);
  if (error.kind === "cancelled") return null;

  switch (error.kind) {
    case "plan_message_limit":
      return <PlanMessageLimitCard error={error} />;
    case "rate_limited":
      return (
        <RateLimitedCard
          error={error}
          onRetry={onRetry}
          onSwitchModel={onSwitchModel}
        />
      );
    case "usage_limit_paused":
      return (
        <UsageLimitPausedCard error={error} onSwitchModel={onSwitchModel} />
      );
    case "quota_exhausted":
      return <QuotaExhaustedCard error={error} onSwitchModel={onSwitchModel} />;
    case "context_overflow":
      return (
        <ContextOverflowCard error={error} onSwitchModel={onSwitchModel} />
      );
    case "model_unavailable":
      return (
        <ModelUnavailableCard
          error={error}
          onSwitchModel={onSwitchModel}
          onApplyModel={onApplyModel}
        />
      );
    case "unauthenticated":
      return <UnauthenticatedCard error={error} onRetry={onRetry} />;
    case "network_unreachable":
      return <NetworkUnreachableCard error={error} onRetry={onRetry} />;
    case "provider_internal":
      return <ProviderInternalCard error={error} onRetry={onRetry} />;
    case "session_resume_missing":
      return <SessionResumeMissingCard error={error} onRetry={onRetry} />;
    case "malformed_response":
      return <MalformedResponseCard error={error} onRetry={onRetry} />;
    case "spawn_failed":
      return <SpawnFailedCard error={error} />;
    case "unknown":
      return <UnknownErrorCard error={error} />;
  }
}

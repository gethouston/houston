/**
 * Typed-provider-error card.
 *
 * Routes a `FeedItem::ProviderError` (typed wire shape from the engine)
 * to the right per-variant renderer. Each variant gets its own visual
 * + i18n keyset + CTAs; the goal is that the user always sees a useful
 * next action, not a generic "something failed" wall.
 *
 * Adding a new ProviderError variant:
 *   1. Add the wire variant in Rust (`provider_error_kind.rs`).
 *   2. Mirror it in `ui/chat/src/types.ts`.
 *   3. Add an i18n keyset under `shell:providerError.<variant>` in
 *      en/es/pt.
 *   4. Add a renderer in the right `provider-error-cards/<file>.tsx`
 *      and a `case` in the dispatcher below.
 *   5. Run `pnpm check-locales` and the engine tests.
 *
 * RULE 0 — every variant MUST resolve to a concrete CTA the user can
 * act on, even Unknown (Report bug). Don't ship a card with no buttons.
 */

import type { ProviderError } from "@houston-ai/chat";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../../lib/query-keys";
import { UnauthenticatedCard } from "./provider-error-cards/auth";
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
  RateLimitedCard,
  UsageLimitPausedCard,
} from "./provider-error-cards/transient";

interface ProviderErrorCardProps {
  error: ProviderError;
  onRetry?: () => Promise<void> | void;
  /** Open the model picker so the user can choose a different model. */
  onSwitchModel?: () => void;
  /** Apply a specific model directly (the `model_unavailable` suggested fallback). */
  onApplyModel?: (model: string) => void;
}

/**
 * Error kinds that change what the engine now reports for the provider's
 * connection status: an auth failure marks the credential broken and an
 * unreachable endpoint flips the local model's reachability (both computed
 * engine-side). The picker/AI Hub cache statuses for 30s, so without a nudge
 * they keep offering the dead provider's models right after the card appears.
 */
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
  // Refresh the cached provider statuses when a status-changing card lands,
  // so the model picker and the AI Models page stop showing the provider as
  // connected while its inline card says otherwise.
  useEffect(() => {
    if (!STATUS_CHANGING_KINDS.has(error.kind)) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.providerStatuses(),
    });
  }, [error.kind, queryClient]);
  // Cancellation has no UI surface; feed-to-messages should drop it
  // before we get here, but guard defensively in case it ever sneaks
  // through (e.g. resumed sessions reading from history).
  if (error.kind === "cancelled") return null;

  switch (error.kind) {
    case "rate_limited":
      return (
        <RateLimitedCard
          error={error}
          onRetry={onRetry}
          onSwitchModel={onSwitchModel}
        />
      );
    case "usage_limit_paused":
      return <UsageLimitPausedCard error={error} />;
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

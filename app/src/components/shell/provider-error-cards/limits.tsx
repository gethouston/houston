/**
 * The LIMIT variants — rate-limited and usage-limit-paused. Both mean "this
 * account has no room right now": rate-limited clears in seconds (so it offers a
 * retry), the plan-window pause clears at a stated time (so it does not).
 *
 * Neither offers another ACCOUNT to continue on, because in a team space there
 * is no other account: every turn runs on the AI account of whoever sent it
 * (HOU-976). The limit is the sender's own to wait out, which is exactly what
 * these cards say.
 *
 * Split from the sibling `transient.tsx` (network / provider-internal /
 * malformed, which recover by retrying now) so each file stays inside the
 * file-size budget. All render on the unified `RowCard` (HOU-467).
 */

import type { ProviderError } from "@houston-ai/chat";
import { Clock, TimerResetIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";
import { providerLabel, RetryButton } from "./shared";

interface LimitProps {
  onRetry?: () => Promise<void> | void;
  onSwitchModel?: () => void;
}

export function RateLimitedCard({
  error,
  onRetry,
  onSwitchModel,
}: LimitProps & {
  error: Extract<ProviderError, { kind: "rate_limited" }>;
}) {
  const { t } = useTranslation("shell");
  const provider = providerLabel(error.provider);
  const body = error.retry_after_seconds
    ? t("providerError.rateLimited.bodyWithRetry", {
        provider,
        seconds: error.retry_after_seconds,
      })
    : t("providerError.rateLimited.body", { provider });
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<Clock className="size-5" />}
        title={t("providerError.rateLimited.title")}
        description={body}
        // `undefined`, never an always-rendered fragment: `RowCard` tests the
        // slot for null, so an empty fragment still mounts the action <span> and
        // its `gap-2` — a phantom column on a card with no buttons. Same rule as
        // `UsageLimitPausedCard` below.
        action={
          onRetry || onSwitchModel ? (
            <>
              {onRetry && (
                <RetryButton
                  onRetry={onRetry}
                  label={t("providerError.rateLimited.retry")}
                />
              )}
              {onSwitchModel && (
                <RowCardButton
                  label={t("providerError.rateLimited.switchModel")}
                  onClick={onSwitchModel}
                  variant="outline"
                />
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}

/**
 * Plan-window usage limit (Anthropic's 5-hour subscription session limit).
 * Distinct from RateLimited: retrying now fails, so waiting for the stated reset
 * is the recovery — which leaves this card deliberately action-less.
 */
export function UsageLimitPausedCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "usage_limit_paused" }>;
}) {
  const { t } = useTranslation("shell");
  const body = error.resets_at
    ? t("providerError.usageLimitPaused.bodyWithReset", {
        time: error.resets_at,
      })
    : t("providerError.usageLimitPaused.body");
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<TimerResetIcon className="size-5" />}
        title={t("providerError.usageLimitPaused.title")}
        description={body}
      />
    </div>
  );
}

import { AsyncButton, cn } from "@houston-ai/core";
import { ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../../lib/providers";
import { LiveStatus } from "../../ai-hub/hub-badges";
import { BrandMark } from "../../provider-browser/brand-mark";
import type {
  FeaturedSubscription,
  SubscriptionCardState,
} from "./featured-subscriptions";

interface SubscriptionCardProps {
  subscription: FeaturedSubscription;
  provider: ProviderInfo;
  state: SubscriptionCardState;
  onConnect: (provider: ProviderInfo) => void;
  onCancel: (provider: ProviderInfo) => Promise<void>;
}

/**
 * One "Your Claude subscription" / "Your ChatGPT subscription" card on the
 * "Connect your AI" screen: a compact tile with the logo, title, subtitle and
 * action stacked on one centered axis. While it can start a sign-in the whole
 * card is one button; while a sign-in runs it becomes a plain panel so its
 * Cancel button is not nested inside another button.
 */
export function SubscriptionCard({
  subscription,
  provider,
  state,
  onConnect,
  onCancel,
}: SubscriptionCardProps) {
  const { t } = useTranslation("setup");
  const shell =
    "flex h-full w-full flex-col items-center rounded-2xl border bg-card px-3 py-5 text-center md:px-5 md:py-6";
  const body = (
    <>
      <BrandMark providerId={provider.id} size="lg" />
      <span className="mt-3 flex flex-col gap-1">
        <span className="text-sm font-semibold text-balance text-ink md:text-base">
          {t(`connectAi.plans.${subscription}.title`)}
        </span>
        {state === "connecting" ? (
          <span className="flex items-center justify-center gap-1.5 text-xs text-balance text-ink-muted md:text-sm">
            <Loader2
              className="size-4 shrink-0 animate-spin"
              aria-hidden="true"
            />
            {t("connectAi.waiting")}
          </span>
        ) : (
          <span className="text-xs text-balance text-ink-muted md:text-sm">
            {t(`connectAi.plans.${subscription}.subtitle`)}
          </span>
        )}
      </span>
    </>
  );

  if (state === "ready" || state === "checking") {
    const checking = state === "checking";
    return (
      <button
        type="button"
        disabled={checking}
        onClick={() => onConnect(provider)}
        className={cn(
          shell,
          "border-line outline-none transition-[background-color,border-color,scale] duration-200 focus-visible:ring-2 focus-visible:ring-focus",
          checking
            ? "cursor-default"
            : "hover:border-ink/20 hover:bg-hover active:scale-[0.98] motion-reduce:active:scale-100",
        )}
      >
        {body}
        <Action>
          {checking ? (
            <span className="text-sm text-ink-muted">
              {t("connectAi.checking")}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
              {t("connectAi.signIn")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </Action>
      </button>
    );
  }

  return (
    <div
      className={cn(
        shell,
        state === "connecting" ? "border-ink/20" : "border-line",
      )}
    >
      {body}
      <Action>
        {state === "connecting" ? (
          <AsyncButton
            size="sm"
            variant="secondary"
            aria-label={t(`connectAi.plans.${subscription}.cancel`)}
            onClick={() => onCancel(provider)}
          >
            {t("connectAi.cancel")}
          </AsyncButton>
        ) : (
          <LiveStatus label={t("connectAi.connected")} />
        )}
      </Action>
    </div>
  );
}

/**
 * The card's action, centered under the text. `mt-auto` pins it to the
 * tile's foot so the two cards' actions line up when their text wraps to
 * different heights.
 */
function Action({ children }: { children: ReactNode }) {
  return (
    <span className="mt-auto flex items-center justify-center pt-4">
      {children}
    </span>
  );
}

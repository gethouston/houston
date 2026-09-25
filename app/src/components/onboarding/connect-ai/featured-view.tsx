import { Button, cn } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../../hooks/use-provider-connections";
import {
  type FeaturedProvider,
  subscriptionCardState,
} from "./featured-subscriptions";
import { SubscriptionCard } from "./subscription-card";

interface FeaturedViewProps {
  featured: readonly FeaturedProvider[];
  connections: ProviderConnections;
  onViewMore: () => void;
  /** Focus "View more" on mount: the user just came back from the full list. */
  focusToggle: boolean;
}

/**
 * The card's opening view: the featured plan cards side by side, and a quiet
 * "View more" that swaps them for every provider in one list.
 */
export function FeaturedView({
  featured,
  connections,
  onViewMore,
  focusToggle,
}: FeaturedViewProps) {
  const { t } = useTranslation("setup");
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Mount-only: the button that swapped the views is gone, so focus lands on
  // the control that swaps them back instead of falling to the page body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per view swap.
  useEffect(() => {
    if (focusToggle) toggleRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "grid gap-3",
          featured.length > 1 ? "grid-cols-2" : "mx-auto w-full max-w-60",
        )}
      >
        {featured.map(({ subscription, provider }) => (
          <SubscriptionCard
            key={provider.id}
            subscription={subscription}
            provider={provider}
            state={subscriptionCardState(
              connections.connectionState(provider),
              connections.busy[provider.id],
            )}
            onConnect={connections.connect}
            onCancel={connections.cancel}
          />
        ))}
      </div>
      <Button
        ref={toggleRef}
        type="button"
        variant="ghost"
        className="self-center text-ink-muted"
        onClick={onViewMore}
      >
        {t("connectAi.viewMore")}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

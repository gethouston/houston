import { Button } from "@houston-ai/core";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../../hooks/use-provider-connections";
import type { HubCatalog } from "../../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../../lib/providers";
import { ProviderBrowser } from "../../provider-browser/provider-browser";

interface AllProvidersViewProps {
  providers: readonly ProviderInfo[];
  connections: ProviderConnections;
  catalog: HubCatalog | undefined;
  /** Returns to the featured cards; `undefined` when there are none to show. */
  onShowFewer: (() => void) | undefined;
  /** Focus "Show fewer options" on mount: the user just pressed "View more". */
  focusToggle: boolean;
}

/**
 * Every provider in one list, Claude and ChatGPT included, in place of the
 * featured cards. The browser renders no dialogs and no auto-advance of its
 * own: the card mounts both once, so a sign-in started here or on a featured
 * card resolves the same way.
 */
export function AllProvidersView({
  providers,
  connections,
  catalog,
  onShowFewer,
  focusToggle,
}: AllProvidersViewProps) {
  const { t } = useTranslation("setup");
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Mount-only: the button that swapped the views is gone, so focus lands on
  // the control that swaps them back instead of falling to the page body.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per view swap.
  useEffect(() => {
    if (focusToggle) toggleRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {onShowFewer && (
        <Button
          ref={toggleRef}
          type="button"
          variant="ghost"
          size="sm"
          className="self-start text-ink-muted"
          onClick={onShowFewer}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("connectAi.showFewer")}
        </Button>
      )}
      <ProviderBrowser
        providers={providers}
        connections={connections}
        catalog={catalog}
        renderDialogs={false}
      />
    </div>
  );
}

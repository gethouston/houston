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
  onShowFewer: (() => void) | undefined;
  focusToggle: boolean;
}

export function AllProvidersView({
  providers,
  connections,
  catalog,
  onShowFewer,
  focusToggle,
}: AllProvidersViewProps) {
  const { t } = useTranslation("setup");
  const toggleRef = useRef<HTMLButtonElement>(null);

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

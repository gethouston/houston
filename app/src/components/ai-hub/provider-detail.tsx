import { Button } from "@houston-ai/core";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderGlyph } from "../shell/provider-logos";
import { SpecChip } from "./hub-badges";
import {
  authChipKey,
  providerDescriptionKey,
  providerModels,
} from "./provider-grouping";
import { ProviderModelList } from "./provider-model-list";

interface ProviderDetailProps {
  provider: ProviderInfo;
  connections: ProviderConnections;
  catalog: HubCatalog;
  onBack: () => void;
  onOpenModel: (key: string) => void;
}

/**
 * The drill-in for a single provider: a hero header (logo, name, description,
 * auth chip, Connect / Sign out) over the searchable list of the models it can
 * run. The local `openai-compatible` provider serves whatever the user's own
 * server exposes, so it shows a hint instead of a catalog.
 */
export function ProviderDetail({
  provider,
  connections,
  catalog,
  onBack,
  onOpenModel,
}: ProviderDetailProps) {
  const { t } = useTranslation("aiHub");
  const connected = connections.isConnected(provider);
  const ready = connections.ready;
  const busy = connections.busy[provider.id];
  const models = providerModels(catalog, provider);
  const isLocal = provider.auth === "openaiCompatible";

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2 w-fit text-muted-foreground"
      >
        <ChevronLeft className="size-4" />
        {t("providerDetail.back")}
      </Button>

      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <ProviderGlyph providerId={provider.id} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-xl font-semibold text-foreground">
            {provider.name}
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t(`providers.${providerDescriptionKey(provider.id)}.description`)}
          </p>
          <div className="flex">
            <SpecChip>{t(`card.${authChipKey(provider)}`)}</SpecChip>
          </div>
        </div>
        <div className="shrink-0">
          {!ready ? (
            <Button disabled variant="secondary">
              {t("card.connect")}
            </Button>
          ) : connected ? (
            <Button
              variant="outline"
              onClick={() => connections.signOut(provider)}
              disabled={busy === "signingOut"}
            >
              {busy === "signingOut" && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {t("providerDetail.signOut")}
            </Button>
          ) : busy === "connecting" ? (
            <Button
              variant="secondary"
              onClick={() => void connections.cancel(provider)}
            >
              <Loader2 className="size-3.5 animate-spin" />
              {t("card.cancel")}
            </Button>
          ) : (
            <Button onClick={() => connections.connect(provider)}>
              {t("card.connect")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("providerDetail.models")}
        </h2>
        {isLocal || models.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("providerDetail.noModels")}
          </p>
        ) : (
          <ProviderModelList
            models={models}
            provider={provider}
            onOpenModel={onOpenModel}
            searchLabel={t("providerDetail.searchModels")}
          />
        )}
      </div>
    </div>
  );
}

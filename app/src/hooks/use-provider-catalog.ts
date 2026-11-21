import type { ProviderCatalog } from "@houston/protocol";
import { useQuery } from "@tanstack/react-query";
import { getEngine, newEngineActive } from "../lib/engine";
import i18n from "../lib/i18n";
import { hydrateProviderCatalog } from "../lib/providers.ts";
import { deriveCatalogFailure } from "./query-error-toast-state.ts";
import { useQueryErrorToast } from "./use-query-error-toast.ts";

let hydratedFrom: ProviderCatalog | null = null;

export function useProviderCatalog(): {
  isReady: boolean;
  updatedAt: number;
  catalog: ProviderCatalog | undefined;
  isLoading: boolean;
} {
  const enabled = newEngineActive();
  const query = useQuery({
    queryKey: ["provider-catalog"],
    queryFn: (): Promise<ProviderCatalog> => getEngine().getCatalog(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: 3,
  });

  const { isFailure, identity } = deriveCatalogFailure({
    isError: query.isError,
    error: query.error,
    isSuccess: query.isSuccess,
    count: query.data?.length ?? 0,
  });
  useQueryErrorToast(
    isFailure,
    identity,
    "provider_catalog",
    i18n.t("providers:toast.catalogLoadFailed"),
  );

  const catalog = query.data;
  if (catalog && catalog !== hydratedFrom) {
    hydratedFrom = catalog;
    hydrateProviderCatalog(catalog);
  }

  return {
    isReady: query.isSuccess,
    updatedAt: query.dataUpdatedAt,
    catalog,
    isLoading: query.isLoading,
  };
}

import type {
  ModelPickerCatalogState,
  ModelPickerModel,
  ModelPickerProvider,
} from "./types";

export function connectedProviders(
  providers: readonly ModelPickerProvider[],
): ModelPickerProvider[] {
  return providers.filter((p) => p.connection === "connected");
}

export function connectedProviderIds(
  providers: readonly ModelPickerProvider[],
): Set<string> {
  const ids = new Set<string>();
  for (const p of providers) if (p.connection === "connected") ids.add(p.id);
  return ids;
}

export function providerListLoading(
  providers: readonly ModelPickerProvider[],
  catalogState: ModelPickerCatalogState,
): boolean {
  if (providers.some((p) => p.connection === "connected")) return false;
  return (
    catalogState === "loading" ||
    providers.some((p) => p.connection === "checking")
  );
}

export function providerListEmpty(
  providers: readonly ModelPickerProvider[],
  catalogState: ModelPickerCatalogState,
): boolean {
  if (providerListLoading(providers, catalogState)) return false;
  return connectedProviders(providers).length === 0;
}

export function modelsForProvider(
  models: readonly ModelPickerModel[],
  connectedIds: ReadonlySet<string>,
  providerId: string,
): ModelPickerModel[] {
  if (!connectedIds.has(providerId)) return [];
  return models.filter((m) => m.providerId === providerId);
}

export function emptyStateAction(
  override: (() => void) | null | undefined,
  onConnectMore: (() => void) | undefined,
): (() => void) | undefined {
  if (override === undefined) return onConnectMore;
  return override ?? undefined;
}

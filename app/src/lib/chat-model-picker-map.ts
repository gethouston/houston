import type { ModelPickerModel, ModelPickerProvider } from "@houston-ai/core";
import { encodeModelPickerId } from "./chat-model-picker-ids.ts";
import { pickerModelRows, withAccountLabel } from "./model-picker.ts";
import {
  type ProviderConnectionStatus,
  providerConnectionState,
} from "./provider-connection.ts";
import { PROVIDER_OVERRIDES } from "./provider-overrides.ts";
import type { ProviderInfo } from "./providers.ts";

type StatusModel = { active_model?: string };

export function rankCuratedFirst<T extends { id: string }>(
  rows: readonly T[],
  curatedIds: readonly string[],
): T[] {
  if (curatedIds.length === 0) return [...rows];
  const rank = new Map(curatedIds.map((id, i) => [id, i]));
  return rows
    .map((row, order) => ({ row, order, curated: rank.get(row.id) }))
    .sort(
      (a, b) =>
        (a.curated ?? Number.MAX_SAFE_INTEGER) -
          (b.curated ?? Number.MAX_SAFE_INTEGER) || a.order - b.order,
    )
    .map((e) => e.row);
}

function curatedModelIds(providerId: string): string[] {
  return Object.keys(PROVIDER_OVERRIDES[providerId]?.models ?? {});
}

function providerModelRows(
  p: ProviderInfo,
  statuses: Record<string, StatusModel | undefined>,
  describe:
    | ((providerId: string, modelId: string, fallback: string) => string)
    | undefined,
  accountLabelOf: ((providerId: string) => string | undefined) | undefined,
): ModelPickerModel[] {
  const rows = pickerModelRows(
    p.models,
    statuses[p.id]?.active_model,
    p.subtitle,
  );
  const accountLabel = accountLabelOf?.(p.id);
  return rankCuratedFirst(rows, curatedModelIds(p.id)).map((row) => ({
    id: encodeModelPickerId(p.id, row.id),
    providerId: p.id,
    name: row.label,
    description: withAccountLabel(
      describe ? describe(p.id, row.id, row.description) : row.description,
      accountLabel,
    ),
  }));
}

export function buildPickerModels(opts: {
  visibleProviders: readonly ProviderInfo[];
  statuses: Record<string, StatusModel | undefined>;
  describe?: (providerId: string, modelId: string, fallback: string) => string;
  accountLabelOf?: (providerId: string) => string | undefined;
}): ModelPickerModel[] {
  const models: ModelPickerModel[] = [];
  for (const p of opts.visibleProviders) {
    models.push(
      ...providerModelRows(
        p,
        opts.statuses,
        opts.describe,
        opts.accountLabelOf,
      ),
    );
  }
  return models;
}

export function buildPickerProviders(opts: {
  visibleProviders: readonly ProviderInfo[];
  statuses: Record<string, ProviderConnectionStatus | undefined>;
  isLoading: boolean;
  withModels: Set<string>;
}): ModelPickerProvider[] {
  return opts.visibleProviders
    .filter((p) => opts.withModels.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      connection: providerConnectionState(opts.statuses[p.id], opts.isLoading),
    }));
}

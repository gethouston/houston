import { Spinner } from "@houston-ai/core";
import {
  defaultTriggerConfig,
  missingRequired,
  parseTriggerConfigSchema,
  type RoutineTriggerBinding,
  TriggerConfigForm,
  type TriggerLabels,
  TriggerPicker,
  type TriggerType,
} from "@houston-ai/routines";
import { useState } from "react";
import { useTriggerTypes } from "../../hooks/queries/use-triggers";
import { useUsableToolkits } from "./use-usable-toolkits";

/**
 * RoutineTriggerEditor — the app-wired body the routine editor injects into its
 * event side (C9). It owns the pick-an-app → pick-an-event → fill-the-details
 * flow, fetching the agent's usable apps and the chosen app's event catalog, and
 * reports the assembled binding (plus a validity flag) up to `RoutineRowEdit`.
 *
 * Validity folds three checks so Save is only enabled on a complete trigger: an
 * app + event are chosen, the generated config's required fields are filled (the
 * form reports this), and a multi-account app has an account pinned.
 */
export interface RoutineTriggerEditorProps {
  agentId: string;
  value: RoutineTriggerBinding | null;
  onChange: (binding: RoutineTriggerBinding | null, valid: boolean) => void;
  labels: TriggerLabels;
}

export function RoutineTriggerEditor({
  agentId,
  value,
  onChange,
  labels,
}: RoutineTriggerEditorProps) {
  const { apps, loading: appsLoading } = useUsableToolkits(agentId);
  const [toolkit, setToolkit] = useState<string | null>(value?.toolkit ?? null);
  const [slug, setSlug] = useState<string | null>(value?.trigger_slug ?? null);
  const [config, setConfig] = useState<Record<string, unknown>>(
    value?.trigger_config ?? {},
  );
  const [configValid, setConfigValid] = useState(!!value?.trigger_slug);
  const [accountId, setAccountId] = useState<string | undefined>(
    value?.connected_account_id,
  );

  const types = useTriggerTypes(toolkit, true);
  const selectedType: TriggerType | null =
    types.data?.find((t) => t.slug === slug) ?? null;

  // Assemble the binding + validity and report up. Called from every handler
  // (never an effect) so there is no render-loop on the parent's fresh onChange.
  const emit = (
    nextToolkit: string | null,
    nextSlug: string | null,
    nextConfig: Record<string, unknown>,
    nextAccount: string | undefined,
    nextConfigValid: boolean,
  ) => {
    const app = apps.find((a) => a.toolkit === nextToolkit);
    const accountsOk =
      !app || app.accounts.length <= 1 || nextAccount !== undefined;
    const binding: RoutineTriggerBinding | null =
      nextToolkit && nextSlug
        ? {
            toolkit: nextToolkit,
            trigger_slug: nextSlug,
            trigger_config: nextConfig,
            ...(nextAccount ? { connected_account_id: nextAccount } : {}),
          }
        : null;
    onChange(binding, !!binding && nextConfigValid && accountsOk);
  };

  const selectToolkit = (tk: string) => {
    const next = tk || null;
    setToolkit(next);
    setSlug(null);
    setConfig({});
    setConfigValid(false);
    setAccountId(undefined);
    emit(next, null, {}, undefined, false);
  };

  const selectTriggerType = (newSlug: string) => {
    const type = types.data?.find((t) => t.slug === newSlug);
    const parsed = type ? parseTriggerConfigSchema(type.config) : null;
    const seedConfig =
      value?.trigger_slug === newSlug
        ? (value.trigger_config ?? {})
        : parsed?.supported
          ? defaultTriggerConfig(parsed.fields)
          : {};
    const seedValid = parsed?.supported
      ? missingRequired(parsed.fields, seedConfig).length === 0
      : true;
    setSlug(newSlug);
    setConfig(seedConfig);
    setConfigValid(seedValid);
    emit(toolkit, newSlug, seedConfig, accountId, seedValid);
  };

  const selectAccount = (id: string) => {
    setAccountId(id);
    emit(toolkit, slug, config, id, configValid);
  };

  const changeConfig = (values: Record<string, unknown>, valid: boolean) => {
    setConfig(values);
    setConfigValid(valid);
    emit(toolkit, slug, values, accountId, valid);
  };

  // Hold the picker until the app list resolves, so it never flashes the
  // "connect an app first" empty state while the connections are still loading.
  if (appsLoading && apps.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <TriggerPicker
        apps={apps}
        selectedToolkit={toolkit}
        onSelectToolkit={selectToolkit}
        triggerTypes={types.data ?? []}
        triggerTypesLoading={types.isLoading}
        selectedTriggerSlug={slug}
        onSelectTriggerType={selectTriggerType}
        selectedAccountId={accountId}
        onSelectAccount={selectAccount}
        labels={labels}
      />
      {selectedType && (
        <TriggerConfigForm
          schema={selectedType.config}
          values={config}
          onChange={changeConfig}
          labels={labels}
        />
      )}
    </div>
  );
}

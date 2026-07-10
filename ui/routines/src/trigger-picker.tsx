/**
 * TriggerPicker — pick the app the routine watches, then the event on it that
 * wakes the routine (C9). Two steps: an app grid (only apps the agent can use,
 * supplied by the app), then a list of that app's event types (human name +
 * description, with a subtle "checks every few minutes" hint for poll-type
 * events). An account select appears only when the app has more than one
 * connected account. Purely presentational — data + fetching live in the app.
 */
import {
  Button,
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from "@houston-ai/core";
import { useState } from "react";
import { DEFAULT_TRIGGER_LABELS, type TriggerLabels } from "./labels";
import type { TriggerApp, TriggerType } from "./types";

export interface TriggerPickerProps {
  apps: TriggerApp[];
  selectedToolkit: string | null;
  onSelectToolkit: (toolkit: string) => void;
  triggerTypes: TriggerType[];
  triggerTypesLoading: boolean;
  selectedTriggerSlug: string | null;
  onSelectTriggerType: (slug: string) => void;
  selectedAccountId?: string;
  onSelectAccount: (accountId: string) => void;
  /** Jump to the Integrations surface to connect an app — turns the no-apps
   *  empty state into an actionable one instead of a dead end. */
  onConnectApp?: () => void;
  labels?: TriggerLabels;
}

function AppLogo({ app }: { app: TriggerApp }) {
  const [broken, setBroken] = useState(false);
  const box = "size-6 shrink-0 rounded-md bg-input";
  if (broken || !app.logoUrl) {
    return (
      <span className={cn(box, "flex items-center justify-center")}>
        <span className="text-[11px] font-semibold text-ink-muted">
          {app.name.charAt(0).toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <img
      src={app.logoUrl}
      alt=""
      className={cn(box, "object-contain")}
      onError={() => setBroken(true)}
    />
  );
}

export function TriggerPicker({
  apps,
  selectedToolkit,
  onSelectToolkit,
  triggerTypes,
  triggerTypesLoading,
  selectedTriggerSlug,
  onSelectTriggerType,
  selectedAccountId,
  onSelectAccount,
  onConnectApp,
  labels = DEFAULT_TRIGGER_LABELS,
}: TriggerPickerProps) {
  const app = apps.find((a) => a.toolkit === selectedToolkit) ?? null;

  if (!app) {
    if (apps.length === 0) {
      return (
        <div
          className={cn(
            "rounded-lg border border-dashed border-ink/[0.12]",
            "flex flex-col items-center gap-2.5 px-4 py-5 text-center",
          )}
        >
          <p className="text-sm text-ink-muted max-w-xs">{labels.noApps}</p>
          {onConnectApp && (
            <Button size="sm" onClick={onConnectApp}>
              {labels.connectApp}
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">{labels.chooseApp}</p>
        <div className="grid grid-cols-2 gap-2">
          {apps.map((a) => (
            <button
              type="button"
              key={a.toolkit}
              onClick={() => onSelectToolkit(a.toolkit)}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-ink/[0.08] p-2.5 text-left",
                "hover:border-ink/20 transition-colors",
              )}
            >
              <AppLogo app={a} />
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {a.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Chosen app + change affordance */}
      <div className="flex items-center gap-2">
        <AppLogo app={app} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {app.name}
        </span>
        <button
          type="button"
          onClick={() => onSelectToolkit("")}
          className="text-xs font-medium text-ink-muted hover:text-ink"
        >
          {labels.changeApp}
        </button>
      </div>

      {app.accounts.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-ink">{labels.accountLabel}</p>
          <Select value={selectedAccountId} onValueChange={onSelectAccount}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {app.accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-muted">
          {labels.chooseEvent}
        </p>
        {triggerTypesLoading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner className="size-4" />
            {labels.loadingEvents}
          </div>
        ) : triggerTypes.length === 0 ? (
          <p className="text-sm text-ink-muted">{labels.noEvents}</p>
        ) : (
          <div className="space-y-1.5">
            {triggerTypes.map((tt) => (
              <TriggerTypeRow
                key={tt.slug}
                type={tt}
                selected={tt.slug === selectedTriggerSlug}
                onSelect={() => onSelectTriggerType(tt.slug)}
                pollHint={labels.pollHint}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TriggerTypeRow({
  type,
  selected,
  onSelect,
  pollHint,
}: {
  type: TriggerType;
  selected: boolean;
  onSelect: () => void;
  pollHint: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-2.5 text-left transition-colors",
        selected
          ? "border-action bg-action/[0.04]"
          : "border-ink/[0.08] hover:border-ink/20",
      )}
    >
      <p className="text-sm font-medium text-ink">{type.name}</p>
      {type.description && (
        <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">
          {type.description}
        </p>
      )}
      {type.type === "poll" && (
        <p className="text-[11px] text-ink-muted mt-1">{pollHint}</p>
      )}
    </button>
  );
}

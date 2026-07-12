import { Switch } from "@houston-ai/core";
import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";
import { labName, modelMarkId } from "../../ai-hub/format.ts";
import { BrandMark } from "../../provider-browser/brand-mark.tsx";

/**
 * One allow-list row for a hub `CatalogModel`, in the AI-hub's visual language
 * but allowlist-shaped: the model's colorful {@link BrandMark}, its friendly
 * name, its muted lab name, and an allow {@link Switch} on the right. Toggling
 * the switch flips every provider offer of the model at once (see
 * {@link toggleModel}); the parent owns the id set.
 */
export function ModelAllowRow({
  model,
  checked,
  disabled,
  allowLabel,
  onToggle,
}: {
  model: CatalogModel;
  checked: boolean;
  disabled: boolean;
  /** Localized `aria-label` for the switch (e.g. "Allow Claude Opus 4.8"). */
  allowLabel: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-chip px-3 py-2.5">
      <BrandMark providerId={modelMarkId(model)} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-ink">
          {model.name}
        </div>
        <div className="truncate text-xs text-ink-muted">
          {labName(model.lab)}
        </div>
      </div>
      <Switch
        aria-label={allowLabel}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

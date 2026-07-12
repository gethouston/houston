import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../../lib/ai-hub/search.ts";
import { AccessChoice } from "../tabs/agent-admin/access-choice.tsx";
import {
  type AccessMode,
  ceilingMode,
} from "../tabs/agent-admin/agent-admin-row-values.ts";
import { LabFilter } from "../tabs/agent-admin/lab-filter.tsx";
import { ModelAllowRow } from "../tabs/agent-admin/model-allow-row.tsx";
import {
  allowedListView,
  modelChecked,
  toggleModel,
} from "../tabs/agent-admin/model-allowlist.ts";
import type { ProviderValue } from "./facets.ts";

/** i18n copy for {@link ModelsAllowlistEditor}; the consumer passes translated strings. */
export interface ModelsAllowlistEditorCopy {
  question: string;
  policyHelper: string;
  anyLabel: string;
  anyDesc: string;
  pickedLabel: string;
  pickedDesc: string;
  allowedHeading: string;
  addHeading: string;
  allowedEmpty: string;
  allowedEmptyLab: string;
  searchModels: string;
  noModels: string;
  /** aria-label for a per-model allow toggle. */
  allowModel: (name: string) => string;
  /** Shown under the question when readOnly (e.g. "Only the owner can change this"). */
  readOnlyNote?: string;
}

export interface ModelsAllowlistEditorProps {
  /** The selectable universe of models (already narrowed to any higher ceiling). */
  models: CatalogModel[];
  /** Current ceiling: `null` = any model allowed, else the explicit id set. */
  allowedModels: string[] | null;
  /** A write is in flight (disables controls). */
  saving: boolean;
  /** Read-only viewer (e.g. a non-owner admin): controls disabled, "Add models" list hidden, `readOnlyNote` shown. */
  readOnly?: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
  copy: ModelsAllowlistEditorCopy;
}

/**
 * Presentational, i18n-agnostic editor for an AI-model allowlist ceiling
 * (Teams v2), the model-side twin of {@link AllowlistEditor}. An always-visible
 * {@link AccessChoice} ("Any model" saves `null`, "Only models you pick" saves an
 * explicit set) over the AI-hub catalog's visual language: one {@link ModelAllowRow}
 * per {@link CatalogModel} (brand mark + name + lab + allow Switch). Selection is
 * over provider-native offer ids — toggling a model flips ALL its offers at once
 * (see {@link toggleModel}) — so a member can pick that model from any provider
 * connected. Writes are instant; `readOnly` disables every control and hides the
 * "Add models" list. All copy is passed in; both the per-agent and org ceilings
 * consume this so they never drift.
 */
export function ModelsAllowlistEditor({
  models,
  allowedModels,
  saving,
  readOnly,
  onSave,
  copy,
}: ModelsAllowlistEditorProps) {
  const [search, setSearch] = useState("");
  // View-only lab filter (never touches saved data); composes with the search.
  const [lab, setLab] = useState<ProviderValue>("all");
  const labFilter = lab === "all" ? undefined : lab;

  const allowedSet = useMemo(
    () => new Set(allowedModels ?? []),
    [allowedModels],
  );
  // Every model the ceiling currently allows (before the view-only lab filter).
  const pickedModels = useMemo(
    () => models.filter((m) => modelChecked(m, allowedSet)),
    [models, allowedSet],
  );
  const allowedList = useMemo(
    () => filterModels(pickedModels, { lab: labFilter }),
    [pickedModels, labFilter],
  );
  const allowedView = allowedListView({
    visibleCount: allowedList.length,
    hasPicked: pickedModels.length > 0,
    labFiltered: labFilter !== undefined,
  });
  // The remaining (not-yet-allowed) models to add, narrowed to the picked lab
  // and ranked by the search box — allowed models live in their own list above.
  const results = useMemo(() => {
    const base = filterModels(
      models.filter((m) => !modelChecked(m, allowedSet)),
      { lab: labFilter },
    );
    return searchModels(base, search);
  }, [models, search, allowedSet, labFilter]);

  const onChoice = (mode: AccessMode) => onSave(mode === "any" ? null : []);
  const toggle = (model: CatalogModel) =>
    onSave(toggleModel(model, [...allowedSet]));

  const renderModel = (model: CatalogModel) => (
    <ModelAllowRow
      key={model.key}
      model={model}
      checked={modelChecked(model, allowedSet)}
      disabled={saving || !!readOnly}
      allowLabel={copy.allowModel(model.name)}
      onToggle={() => toggle(model)}
    />
  );

  return (
    <div>
      <h2 className="mb-1 text-lg font-medium text-ink">{copy.question}</h2>
      <p className="mb-4 text-sm text-ink-muted">{copy.policyHelper}</p>

      {readOnly && copy.readOnlyNote && (
        <p className="mb-4 text-sm text-ink-muted">{copy.readOnlyNote}</p>
      )}

      <AccessChoice
        question={copy.question}
        value={ceilingMode(allowedModels)}
        disabled={saving || readOnly}
        onChange={onChoice}
        options={[
          { value: "any", label: copy.anyLabel, description: copy.anyDesc },
          {
            value: "picked",
            label: copy.pickedLabel,
            description: copy.pickedDesc,
          },
        ]}
      />

      {allowedModels !== null && (
        <div className="mt-6">
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-ink">
              {copy.allowedHeading}
            </h3>
            {allowedView === "list" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {allowedList.map(renderModel)}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                {allowedView === "empty-lab"
                  ? copy.allowedEmptyLab
                  : copy.allowedEmpty}
              </p>
            )}
          </section>

          {!readOnly && (
            <section>
              <h3 className="mb-3 text-sm font-medium text-ink">
                {copy.addHeading}
              </h3>
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={copy.searchModels}
                    className="h-9 w-full rounded-full border border-line bg-input pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus/20"
                  />
                </div>
                <LabFilter models={models} value={lab} onChange={setLab} />
              </div>
              {results.length === 0 ? (
                <p className="py-4 text-center text-sm text-ink-muted">
                  {copy.noModels}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {results.map(renderModel)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

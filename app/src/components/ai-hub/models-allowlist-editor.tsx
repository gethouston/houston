import { CatalogSearchField } from "@houston-ai/core";
import { useId, useMemo, useState } from "react";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../../lib/ai-hub/search.ts";
import { AccessChoice } from "../agent/agent-admin/access-choice.tsx";
import {
  type AccessMode,
  ceilingMode,
} from "../agent/agent-admin/agent-admin-row-values.ts";
import { LabFilter } from "../agent/agent-admin/lab-filter.tsx";
import { ModelAllowRow } from "../agent/agent-admin/model-allow-row.tsx";
import {
  allowedListView,
  modelChecked,
  toggleModel,
} from "../agent/agent-admin/model-allowlist.ts";
import type { ProviderValue } from "./facets.ts";
import type { ModelsAllowlistEditorProps } from "./models-allowlist-editor-types";

export type {
  ModelsAllowlistEditorCopy,
  ModelsAllowlistEditorProps,
} from "./models-allowlist-editor-types";

/**
 * Presentational, i18n-agnostic editor for an AI-model allowlist ceiling
 * (Teams v2), the model-side twin of {@link AllowlistEditor}. An always-visible
 * {@link AccessChoice} (allow all saves `null`, "Only models you pick" saves an
 * explicit set) over the AI-hub catalog's visual language: one {@link ModelAllowRow}
 * per {@link CatalogModel} (brand mark + name + lab + allow Switch). Selection is
 * over provider-native offer ids — toggling a model flips ALL its offers at once
 * (see {@link toggleModel}) — so a member can pick that model from any provider
 * connected. Writes are instant. All copy is passed in; both the per-agent and
 * org ceilings consume this so they never drift.
 */
export function ModelsAllowlistEditor({
  models,
  allowedModels,
  saving,
  onSave,
  copy,
  labelledBy,
  showIntro = true,
}: ModelsAllowlistEditorProps) {
  const generatedHeadingId = useId();
  const headingId = labelledBy ?? generatedHeadingId;
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
      disabled={saving}
      allowLabel={copy.allowModel(model.name)}
      onToggle={() => toggle(model)}
    />
  );

  return (
    <div>
      {showIntro && (
        <>
          <h2 id={headingId} className="mb-1 text-lg font-medium text-ink">
            {copy.question}
          </h2>
          <p className="mb-4 text-sm text-ink-muted">{copy.policyHelper}</p>
        </>
      )}

      <AccessChoice
        labelledBy={headingId}
        value={ceilingMode(allowedModels)}
        disabled={saving}
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

          <section>
            <h3 className="mb-3 text-sm font-medium text-ink">
              {copy.addHeading}
            </h3>
            <div className="mb-3 flex items-center gap-2">
              <CatalogSearchField
                className="flex-1"
                value={search}
                onChange={setSearch}
                label={copy.searchModels}
                clearLabel={copy.clearSearch}
              />
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
        </div>
      )}
    </div>
  );
}

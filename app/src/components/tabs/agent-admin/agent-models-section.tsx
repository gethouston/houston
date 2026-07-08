import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../../../lib/ai-hub/search.ts";
import type { ProviderValue } from "../../ai-hub/facets.ts";
import { AccessChoice } from "./access-choice.tsx";
import { type AccessMode, ceilingMode } from "./agent-admin-row-values.ts";
import { LabFilter } from "./lab-filter.tsx";
import { ModelAllowRow } from "./model-allow-row.tsx";
import {
  allowedListView,
  modelChecked,
  toggleModel,
} from "./model-allowlist.ts";

interface AgentModelsSectionProps {
  /** The agent-level model ceiling: `null` = all allowed, else the explicit set. */
  allowedModels: string[] | null;
  /** The AI-hub model directory (one entry per model, deduped across providers). */
  models: CatalogModel[];
  /** A write is in flight (disables the controls). */
  saving: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's AI-model ceiling (Teams v2),
 * rendered flush in the Access section's right pane (no card wrapper). Reuses
 * the AI-hub's catalog and visual language: one row per {@link CatalogModel}
 * (its brand mark, name, lab), each with an allow Switch. An always-visible
 * two-option choice ("Any model" saves `null`, "Only models you pick" saves an
 * explicit set); when restricting, the allowed models list above a searchable
 * "Add models" list. Selection is over provider-native offer ids: toggling a
 * model flips ALL its offers at once, so a member can pick that model from any
 * provider they connect. Writes are instant + optimistic; the gateway is the
 * real enforcer.
 */
export function AgentModelsSection({
  allowedModels,
  models,
  saving,
  onSave,
}: AgentModelsSectionProps) {
  const { t } = useTranslation("teams");
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
  // The allowed models shown as their own short list above the rest, narrowed to
  // the picked lab.
  const allowedList = useMemo(
    () => filterModels(pickedModels, { lab: labFilter }),
    [pickedModels, labFilter],
  );
  // An empty visible list means either "nothing picked" or "the lab filter hides
  // every pick" — distinct copy so we never falsely claim nothing is picked.
  const allowedView = allowedListView({
    visibleCount: allowedList.length,
    hasPicked: pickedModels.length > 0,
    labFiltered: labFilter !== undefined,
  });
  // The remaining (not-yet-allowed) models to add, narrowed to the picked lab
  // and ranked by the search box — allowed models live in their own list above,
  // so each appears once.
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
      allowLabel={t("agentAdmin.models.allowModel", { name: model.name })}
      onToggle={() => toggle(model)}
    />
  );

  return (
    <div>
      <h2 className="mb-4 text-lg font-medium text-foreground">
        {t("agentAdmin.models.question")}
      </h2>

      <AccessChoice
        question={t("agentAdmin.models.question")}
        value={ceilingMode(allowedModels)}
        disabled={saving}
        onChange={onChoice}
        options={[
          {
            value: "any",
            label: t("agentAdmin.models.anyLabel"),
            description: t("agentAdmin.models.anyDesc"),
          },
          {
            value: "picked",
            label: t("agentAdmin.models.pickedLabel"),
            description: t("agentAdmin.models.pickedDesc"),
          },
        ]}
      />

      {allowedModels !== null && (
        <div className="mt-6">
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              {t("agentAdmin.models.allowedHeading")}
            </h3>
            {allowedView === "list" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {allowedList.map(renderModel)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t(
                  allowedView === "empty-lab"
                    ? "agentAdmin.models.allowedEmptyLab"
                    : "agentAdmin.models.allowedEmpty",
                )}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-foreground">
              {t("agentAdmin.models.addHeading")}
            </h3>
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("agentAdmin.models.searchModels")}
                  className="h-9 w-full rounded-full border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <LabFilter models={models} value={lab} onChange={setLab} />
            </div>
            {results.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("agentAdmin.models.noModels")}
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

import { Switch } from "@houston-ai/core";
import { useId, useMemo, useState } from "react";
import { AccessChoice } from "../agent/agent-admin/access-choice.tsx";
import {
  type AccessMode,
  ceilingMode,
} from "../agent/agent-admin/agent-admin-row-values.ts";
import type { AllowlistEditorProps } from "./allowlist-editor-types";
import { AppCatalogGrid } from "./app-catalog-grid";
import { appDisplay } from "./app-display";
import { AppRow } from "./app-row";
import { categoryListView, toolkitsInCategory } from "./browse-model";

export type {
  AllowlistEditorCopy,
  AllowlistEditorProps,
} from "./allowlist-editor-types";

/**
 * Presentational, i18n-agnostic editor for an integration allowlist ceiling
 * (Teams v2): an always-visible {@link AccessChoice} (allow all saves `null`,
 * "Only apps you pick" saves an explicit set) over the shared
 * {@link AppCatalogGrid} with a per-app allow Switch. Writes are instant; "Only
 * apps you pick" seeds from `seedToolkits` (filtered to `universe`) so it never
 * cuts off in-use apps. `readOnly` disables every control and hides the "Add
 * apps" catalog; all copy is passed in.
 */
export function AllowlistEditor({
  universe,
  allowedToolkits,
  seedToolkits,
  saving,
  readOnly,
  onSave,
  copy,
  rowMeta,
  labelledBy,
  showIntro = true,
}: AllowlistEditorProps) {
  const generatedHeadingId = useId();
  const headingId = labelledBy ?? generatedHeadingId;
  // View-only category filter shared by the allowed list + "Add apps" catalog.
  const [category, setCategory] = useState("all");

  const universeSlugs = useMemo(
    () => new Set(universe.map((tk) => tk.slug)),
    [universe],
  );
  const allowedSet = useMemo(
    () => new Set(allowedToolkits ?? []),
    [allowedToolkits],
  );
  // The allowed apps (within the universe), then narrowed to the picked category.
  const allowedApps = useMemo(
    () => universe.filter((tk) => allowedSet.has(tk.slug)),
    [universe, allowedSet],
  );
  const inCat = useMemo(
    () => toolkitsInCategory(universe, category),
    [universe, category],
  );
  const allowedVisible = inCat
    ? allowedApps.filter((tk) => inCat.has(tk.slug))
    : allowedApps;
  const allowedView = categoryListView({
    visibleCount: allowedVisible.length,
    hasAny: allowedApps.length > 0,
    categoryFiltered: category !== "all",
  });

  const onChoice = (mode: AccessMode) =>
    mode === "any"
      ? onSave(null)
      : // Seed with in-use apps (within the universe) so restricting never cuts off one already in use.
        onSave([...seedToolkits].filter((s) => universeSlugs.has(s)).sort());
  const toggle = (slug: string) => {
    const next = new Set(allowedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onSave([...next].sort());
  };

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

      {readOnly && copy.readOnlyNote && (
        <p className="mb-4 text-sm text-ink-muted">{copy.readOnlyNote}</p>
      )}
      <AccessChoice
        labelledBy={headingId}
        value={ceilingMode(allowedToolkits)}
        disabled={saving || readOnly}
        onChange={onChoice}
        options={[
          {
            value: "any",
            label: copy.anyLabel,
            description: copy.anyDesc,
          },
          {
            value: "picked",
            label: copy.pickedLabel,
            description: copy.pickedDesc,
          },
        ]}
      />

      {allowedToolkits !== null && (
        <div className="mt-6">
          <section className="mb-8">
            <h3 className="mb-2 text-sm font-medium text-ink">
              {copy.allowedHeading}
            </h3>
            {allowedView !== "list" ? (
              <p className="text-sm text-ink-muted">
                {allowedView === "empty-category"
                  ? copy.allowedEmptyCategory
                  : copy.allowedEmpty}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {allowedVisible.map((tk) => {
                  const display = appDisplay(tk.slug, tk);
                  const meta = rowMeta?.get(tk.slug);
                  return (
                    <AppRow
                      key={tk.slug}
                      display={display}
                      description={meta ?? display.description}
                      trailing={
                        <Switch
                          aria-label={copy.allowApp(display.name)}
                          checked
                          disabled={saving || readOnly}
                          onCheckedChange={() => toggle(tk.slug)}
                        />
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>

          {!readOnly && (
            <section>
              <h3 className="mb-3 text-sm font-medium text-ink">
                {copy.addHeading}
              </h3>
              <AppCatalogGrid
                catalog={universe}
                category={category}
                onCategoryChange={setCategory}
                excludeToolkits={allowedSet}
                renderRow={(display, tk) => ({
                  trailing: (
                    <Switch
                      aria-label={copy.allowApp(display.name)}
                      checked={allowedSet.has(tk.slug)}
                      disabled={saving}
                      onCheckedChange={() => toggle(tk.slug)}
                    />
                  ),
                })}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

import type { SkillCategoryOption } from "@houston-ai/skills";
import { DEFAULT_SHELVES, SkillCategorySelect } from "@houston-ai/skills";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/**
 * The "no filter" value, `CATEGORY_ALL` in
 * `ui/skills/src/skill-marketplace-state-model.ts`. The picker compares
 * `value` against it to decide whether the trigger shows a category or the
 * default label.
 */
const CATEGORY_ALL = "all";

/** The curated shelves, exactly as the marketplace section derives them. */
const options: SkillCategoryOption[] = DEFAULT_SHELVES.map((shelf) => ({
  value: shelf.id,
  label: shelf.title,
}));

const LABELS = {
  allCategories: "All categories",
  ariaLabel: "Filter skills by category",
};

/** Controlled by the page, the way the marketplace section owns it. */
function LiveSelect() {
  const [value, setValue] = useState(CATEGORY_ALL);
  return (
    <div className="flex flex-col gap-2">
      <SkillCategorySelect
        options={options}
        value={value}
        onChange={setValue}
        labels={LABELS}
      />
      <p className="text-[13px] text-ink-muted leading-[1.4]">
        Selected: <code className="font-mono">{value}</code>
      </p>
    </div>
  );
}

function SkillCategorySelectSpecimen() {
  return (
    <SpecimenPage
      title="Skill category select"
      intro="The category pill beside the marketplace search box: a short popover list of the curated shelves, plus the default that clears the filter."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants. The trigger shows the selected category's label, or the default label while nothing is picked."
      >
        <SpecimenRow label="Nothing selected">
          <SkillCategorySelect
            options={options}
            value={CATEGORY_ALL}
            onChange={() => undefined}
            labels={LABELS}
          />
        </SpecimenRow>
        <SpecimenRow label="A category selected">
          <SkillCategorySelect
            options={options}
            value="legal"
            onChange={() => undefined}
            labels={LABELS}
          />
        </SpecimenRow>
        <SpecimenRow label="Translated">
          <SkillCategorySelect
            options={[
              { value: "marketing", label: "Marketing" },
              { value: "sales", label: "Ventas" },
              { value: "legal", label: "Legal" },
            ]}
            value="sales"
            onChange={() => undefined}
            labels={{
              allCategories: "Todas las categorías",
              ariaLabel: "Filtrar skills por categoría",
            }}
          />
        </SpecimenRow>
        <SpecimenRow label="Long label truncates">
          <SkillCategorySelect
            options={[
              {
                value: "productivity",
                label: "Productivity and everyday operations",
              },
            ]}
            value="productivity"
            onChange={() => undefined}
            labels={LABELS}
            className="max-w-56"
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Closed and open are the whole set — the popover owns keyboard and focus, and the selected row carries the check. There is no disabled state: an empty option list is the caller's job to not render."
      >
        <SpecimenRow label="Open it">
          <SkillCategorySelect
            options={options}
            value="writing"
            onChange={() => undefined}
            labels={LABELS}
          />
        </SpecimenRow>
        <SpecimenRow label="Live">
          <LiveSelect />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="One size: a 36px pill, the height the search field beside it uses."
      >
        <SpecimenRow label="Beside the search field">
          <div className="flex w-full max-w-lg gap-2">
            <div className="h-9 flex-1 rounded-full border border-line bg-input px-4 text-[13px] text-ink-muted leading-9">
              Search more than 90K skills...
            </div>
            <SkillCategorySelect
              options={options}
              value={CATEGORY_ALL}
              onChange={() => undefined}
              labels={LABELS}
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "options",
            type: "SkillCategoryOption[]",
            note: "`{ value, label }` per category, labels already translated. The marketplace derives them from its shelves.",
          },
          {
            name: "value",
            type: "string",
            note: 'The selected option\'s `value`, or `CATEGORY_ALL` ("all") for the default row.',
          },
          {
            name: "onChange",
            type: "(next: string) => void",
            note: "Fires with the picked value, then the popover closes.",
          },
          {
            name: "labels",
            type: "SkillCategorySelectLabels",
            note: "`allCategories` (default row and cleared trigger) and `ariaLabel` (the trigger's accessible name). Required.",
          },
          {
            name: "className",
            type: "string",
            note: "Merged onto the trigger pill.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "border-line",
          "bg-chip",
          "text-ink",
          "text-ink-muted",
          "focus-visible:ring-focus/20",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["SkillCategorySelect", "DEFAULT_SHELVES"];

export const specimen: Specimen = {
  id: "skills-category-select",
  title: "Skill category select",
  group: "Skills",
  render: () => <SkillCategorySelectSpecimen />,
};

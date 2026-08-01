import { CatalogSearchField } from "@houston-ai/core";
import { useState } from "react";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

const props: readonly SpecimenProp[] = [
  {
    name: "value",
    type: "string",
    note: "Controlled: the consumer owns the query and filters with it.",
  },
  {
    name: "onChange",
    type: "(value: string) => void",
    note: "Receives the input's value, not the event.",
  },
  {
    name: "label",
    type: "string",
    note: "Placeholder AND accessible name. Localized by the consumer.",
  },
  {
    name: "className",
    type: "string",
    note: "Lands on the wrapper — this is where width is set.",
  },
];

/** The field is controlled, so every example owns a real piece of state. */
function Field({
  initial = "",
  label = "Search agents",
  className,
}: {
  initial?: string;
  label?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <CatalogSearchField
      value={value}
      onChange={setValue}
      label={label}
      className={className}
    />
  );
}

function CatalogSearchFieldSpecimen() {
  return (
    <SpecimenPage
      title="Catalog search field"
      intro="The rounded search field a catalog surface pins above its sections: magnifier inside-left, one string doing placeholder and accessible name."
    >
      <SpecimenSection
        title="Variants"
        note="One form, one height. Width comes from the wrapper, so it fits a sticky controls row as readily as a sidebar."
      >
        <SpecimenRow label="Default">
          <Field className="w-72" />
        </SpecimenRow>
        <SpecimenRow label="Full width">
          <div className="w-full">
            <Field label="Search integrations" />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Narrow">
          <Field className="w-48" label="Search skills" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Type in any of them: the field is fully controlled, and focus draws the shared focus ring rather than a border colour change."
      >
        <SpecimenRow label="Empty">
          <Field className="w-72" />
        </SpecimenRow>
        <SpecimenRow label="With a query">
          <Field className="w-72" initial="Inbox Zero" />
        </SpecimenRow>
        <SpecimenRow label="Focused">
          <Field className="w-72" label="Click me: 2px focus ring" />
        </SpecimenRow>
        <SpecimenRow label="Long query">
          <Field
            className="w-72"
            initial="agents that read receipts from my inbox"
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />

      <SpecimenTokens
        classes={[
          "bg-input",
          "border-line-input",
          "text-ink",
          "text-ink-muted",
          "placeholder:text-ink-muted",
          "focus:ring-focus/20",
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
export const sources: string[] = ["CatalogSearchField"];

export const specimen: Specimen = {
  id: "core-catalog-search-field",
  title: "Catalog search field",
  group: "Catalog",
  render: () => <CatalogSearchFieldSpecimen />,
};

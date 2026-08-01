import { cn } from "@houston-ai/core";
import type { SchedulePreset } from "@houston-ai/routines";
import { ScheduleBuilder } from "@houston-ai/routines";
import { storeSurface, storeType } from "@houston-ai/store";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { builderProps } from "./schedule-builder-parts";

/**
 * The builder is controlled, so every example owns the cron it edits — and
 * prints it, because the generated expression is the thing under review.
 */
function Builder({
  cron,
  presets,
  locale,
}: {
  cron: string;
  presets?: SchedulePreset[];
  locale?: string;
}) {
  const [value, setValue] = useState(cron);
  return (
    <div className={cn(storeSurface.panel, "w-80 space-y-3")}>
      <ScheduleBuilder
        value={value}
        onChange={setValue}
        presets={presets}
        locale={locale}
      />
      <code className={cn(storeType.meta, "block font-mono")}>{value}</code>
    </div>
  );
}

function ScheduleBuilderSpecimen() {
  return (
    <SpecimenPage
      title="ScheduleBuilder"
      intro="How a non-technical person writes cron: pick a preset, then fill in the one or two fields it reveals. There is no raw-cron input anywhere — the expression is output, never input."
    >
      <SpecimenSection
        title="Variants"
        note="`presets` is the only structural prop. It defaults to all six; passing a subset is how a surface offers a narrower vocabulary. `Custom` is a preset like any other — it reveals the Repeat every N picker rather than a text field."
      >
        <SpecimenRow label="All six presets (live)">
          <Builder cron="0 8 * * 1-5" />
        </SpecimenRow>
        <SpecimenRow label="A narrower set">
          <Builder cron="0 9 * * *" presets={["daily", "weekly", "custom"]} />
        </SpecimenRow>
        <SpecimenRow label="Localized (es-ES)">
          <Builder cron="0 17 * * 5" locale="es-ES" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Each preset reveals only the fields it needs, and the reveal is animated so the card grows instead of snapping. The plain-language summary above the fields is the live read-back — it is what the reader checks, not the cron. One gap worth fixing: emptying the Custom count outlines the field in a raw `border-red-500/50`, the only colour on this surface that resolves no token."
      >
        <SpecimenRow label="Daily — just a time">
          <Builder cron="0 8 * * *" />
        </SpecimenRow>
        <SpecimenRow label="Weekly — reveals the day multi-select">
          <Builder cron="0 9 * * 1,3,5" />
        </SpecimenRow>
        <SpecimenRow label="Monthly — reveals the day of month">
          <Builder cron="0 9 1 * *" />
        </SpecimenRow>
        <SpecimenRow label="Custom — every N hours">
          <Builder cron="0 */6 * * *" />
        </SpecimenRow>
        <SpecimenRow label="Custom in months — reveals day of month and time">
          <Builder cron="0 9 15 */3 *" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={builderProps} />

      <SpecimenTokens
        classes={[
          "bg-action",
          "bg-input",
          "bg-chip-subtle",
          "border-line/20",
          "border-ink/[0.04]",
          "text-action-text",
          "text-ink",
          "text-ink-muted",
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
export const sources: string[] = ["ScheduleBuilder"];

export const specimen: Specimen = {
  id: "routines-schedule-builder",
  title: "ScheduleBuilder",
  group: "Routines",
  render: () => <ScheduleBuilderSpecimen />,
};

import { cn } from "@houston-ai/core";
import type { ScheduleFloor, SchedulePreset } from "@houston-ai/routines";
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

const FREE_FLOOR: ScheduleFloor = {
  minutes: 15,
  allows: (cron) => {
    const every = cron.match(/^@every (\d+)(m|h)$/);
    if (every) return Number(every[1]) * (every[2] === "h" ? 60 : 1) >= 15;
    const step = cron.match(/^\*\/(\d+) \* \* \* \*$/);
    if (cron === "* * * * *") return false;
    if (!step) return true;
    const n = Number(step[1]);
    const last = Math.floor(59 / n) * n;
    return (last === 0 ? 60 : Math.min(n, 60 - last)) >= 15;
  },
};

function Builder({
  cron,
  presets,
  locale,
  floor,
}: {
  cron: string;
  presets?: SchedulePreset[];
  locale?: string;
  floor?: ScheduleFloor;
}) {
  const [value, setValue] = useState(cron);
  return (
    <div className={cn(storeSurface.panel, "w-80 space-y-3")}>
      <ScheduleBuilder
        value={value}
        onChange={setValue}
        presets={presets}
        locale={locale}
        floor={floor}
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
        note="Each preset reveals only the fields it needs, and the reveal is animated so the card grows instead of snapping. The plain-language summary above the fields is the live read-back — it is what the reader checks, not the cron. Emptying the Custom count outlines the field in `border-danger/40`."
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
        <SpecimenRow label="15-minute floor — an existing 5-minute schedule">
          <Builder cron="*/5 * * * *" floor={FREE_FLOOR} />
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
          "text-warning-ink",
        ]}
      />
    </SpecimenPage>
  );
}

export const sources: string[] = ["ScheduleBuilder"];

export const specimen: Specimen = {
  id: "routines-schedule-builder",
  title: "ScheduleBuilder",
  group: "Routines",
  render: () => <ScheduleBuilderSpecimen />,
};

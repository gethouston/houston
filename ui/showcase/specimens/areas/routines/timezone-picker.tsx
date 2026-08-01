import { DEFAULT_GRID_LABELS, TimezonePicker } from "@houston-ai/routines";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { TIMEZONE } from "./sample";

const copy = {
  label: DEFAULT_GRID_LABELS.timezoneLabel,
  hint: DEFAULT_GRID_LABELS.timezoneHint,
  searchPlaceholder: DEFAULT_GRID_LABELS.timezoneSearchPlaceholder,
  noResults: DEFAULT_GRID_LABELS.timezoneNoResults,
};

/** Open it and type: "tokyo", "new york", "sao paulo", "gmt+5" all narrow. */
function LivePicker({ variant }: { variant?: "card" | "bare" }) {
  const [tz, setTz] = useState(TIMEZONE);
  return (
    <div className="w-full max-w-sm">
      <TimezonePicker
        {...copy}
        variant={variant}
        accountTimezone={tz}
        onTimezoneChange={setTz}
      />
    </div>
  );
}

function TimezonePickerSpecimen() {
  return (
    <SpecimenPage
      title="TimezonePicker"
      intro="The one zone every routine on the account fires in. A searchable combobox over ~400 IANA zones — never the OS-native select, which ignored the palette and filled the window."
    >
      <SpecimenSection
        title="Variants"
        note="`card` (the default) keeps the titled grey panel, so the control reads as governing everything below it. `bare` drops all chrome and renders only the trigger — that is what the Routines list uses in its quiet footer."
      >
        <SpecimenRow label="card (live)">
          <LivePicker />
        </SpecimenRow>
        <SpecimenRow label="bare (live)">
          <LivePicker variant="bare" />
        </SpecimenRow>
        <SpecimenRow label="bare, in the list footer">
          <div className="w-full max-w-xl rounded-xl border border-line bg-card/40 p-2">
            <div className="border-line/50 border-t px-4 py-2">
              <TimezonePicker
                {...copy}
                variant="bare"
                accountTimezone="Asia/Tokyo"
                onTimezoneChange={() => {}}
              />
            </div>
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The trigger's accessible name pairs the field label WITH the chosen zone, so a screen reader hears “Timezone: Tokyo, GMT+9” rather than just “Timezone”. Search is accent-insensitive: “sao paulo” matches São Paulo."
      >
        <SpecimenRow label="A long city name truncates">
          <div className="w-64">
            <TimezonePicker
              {...copy}
              accountTimezone="America/Argentina/Buenos_Aires"
              onTimezoneChange={() => {}}
            />
          </div>
        </SpecimenRow>
        <SpecimenRow label="A zone with no offset label">
          <div className="w-full max-w-sm">
            <TimezonePicker
              {...copy}
              accountTimezone="UTC"
              onTimezoneChange={() => {}}
            />
          </div>
        </SpecimenRow>
        <SpecimenRow label="Localized copy (pt)">
          <div className="w-full max-w-sm">
            <TimezonePicker
              accountTimezone="America/Sao_Paulo"
              onTimezoneChange={() => {}}
              label="Fuso horário"
              hint="Todas as suas rotinas rodam neste fuso."
              searchPlaceholder="Buscar fusos…"
              noResults="Nenhum fuso encontrado"
            />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "accountTimezone",
            type: "string",
            note: "Required. The persisted IANA zone; always present in the list, even if the platform omits it.",
          },
          {
            name: "onTimezoneChange",
            type: "(tz: string) => void",
            note: "Required. Fires only when a different zone is picked.",
          },
          {
            name: "label",
            type: "string",
            note: "Required. The card title, and half of the trigger's accessible name.",
          },
          {
            name: "hint",
            type: "string",
            note: "Required. The one-line note beside the title, in the card variant.",
          },
          {
            name: "searchPlaceholder",
            type: "string",
            note: "Required. Placeholder for the in-popover keyword search.",
          },
          {
            name: "noResults",
            type: "string",
            note: "Required. Shown when nothing matches the query.",
          },
          {
            name: "variant",
            type: '"card" | "bare"',
            note: 'Defaults to `"card"`. `"bare"` is trigger-only, capped at 16rem, with a 18rem popover.',
          },
          {
            name: "className",
            type: "string",
            note: "Lands on the card in `card`, and on the trigger button in `bare`.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-chip",
          "bg-input",
          "border-line/20",
          "border-line/40",
          "text-ink",
          "text-ink-muted",
          "text-ink-muted/70",
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
export const sources: string[] = ["TimezonePicker"];

export const specimen: Specimen = {
  id: "routines-timezone-picker",
  title: "TimezonePicker",
  group: "Routines",
  render: () => <TimezonePickerSpecimen />,
};

import { TooltipProvider } from "@houston-ai/core";
import { DEFAULT_GRID_LABELS, RoutineDraftRow } from "@houston-ai/routines";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { Listbox } from "./routine-row-states";

/** Several setup chats at once — clicking one selects it, the X discards it. */
function LiveDrafts() {
  const [drafts, setDrafts] = useState(["draft-1", "draft-2", "draft-3"]);
  const [selected, setSelected] = useState("draft-1");
  return (
    <Listbox>
      {drafts.map((id) => (
        <RoutineDraftRow
          key={id}
          selected={selected === id}
          onResume={() => setSelected(id)}
          onDiscard={() => setDrafts((all) => all.filter((one) => one !== id))}
        />
      ))}
    </Listbox>
  );
}

function RoutineDraftRowSpecimen() {
  return (
    <SpecimenPage
      title="RoutineDraftRow"
      intro="A routine still being set up in chat, before it exists. It sits above the created rows in the same list, so an unfinished setup is never a banner the reader has to dismiss."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop, and no name either: a draft has not been named yet, so the row shows the italic placeholder from `labels.draftTitle` behind a message glyph. Clicking anywhere resumes its chat; only the trailing X discards."
      >
        <SpecimenRow label="Default">
          <Listbox>
            <RoutineDraftRow onResume={() => {}} onDiscard={() => {}} />
          </Listbox>
        </SpecimenRow>
        <SpecimenRow label="Several at once (live)">
          <LiveDrafts />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Exactly the created row's selection language — the same border, fill and focus ring — so the two kinds of row read as one list rather than two."
      >
        <SpecimenRow label="Selected">
          <Listbox>
            <RoutineDraftRow
              selected
              onResume={() => {}}
              onDiscard={() => {}}
            />
          </Listbox>
        </SpecimenRow>
        <SpecimenRow label="Localized labels (pt)">
          <Listbox>
            <RoutineDraftRow
              labels={{
                ...DEFAULT_GRID_LABELS,
                draftTitle: "Rotina sendo criada no chat",
                draftDiscard: "Descartar",
              }}
              onResume={() => {}}
              onDiscard={() => {}}
            />
          </Listbox>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "selected",
            type: "boolean",
            note: "Defaults to `false`. Marks the draft whose chat is open; sets `aria-selected`.",
          },
          {
            name: "onResume",
            type: "() => void",
            note: "Required. Fired by a click on the row, and by Enter/Space on the row itself.",
          },
          {
            name: "onDiscard",
            type: "() => void",
            note: "Required. The trailing X; its click never bubbles, so discarding never resumes.",
          },
          {
            name: "labels",
            type: "RoutinesGridLabels",
            note: "Reads `draftTitle` and `draftDiscard`. Defaults to `DEFAULT_GRID_LABELS`.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-card",
          "bg-hover",
          "bg-hover/40",
          "border-line",
          "border-transparent",
          "ring-focus",
          "text-ink",
          "text-ink-muted",
          "text-ink-muted/60",
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
export const sources: string[] = ["RoutineDraftRow"];

export const specimen: Specimen = {
  id: "routines-draft-row",
  title: "RoutineDraftRow",
  group: "Routines",
  render: () => (
    <TooltipProvider>
      <RoutineDraftRowSpecimen />
    </TooltipProvider>
  ),
};

import { Button } from "@houston-ai/core";
import { DEFAULT_GRID_LABELS, RoutinesGridEmpty } from "@houston-ai/routines";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** The empty state is a `flex-1` pane, so give it a bounded column to fill. */
function Pane({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-72 w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-card/40">
      {children}
    </div>
  );
}

function RoutinesGridEmptySpecimen() {
  return (
    <SpecimenPage
      title="RoutinesGridEmpty"
      intro="The first thing a new agent's Routines tab says: nothing is scheduled yet, and here is the one button that changes that."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — the only difference is whether the app hands over its create action. It does: when the list is empty the header row drops entirely and `New routine` moves in here, so the empty state is never a dead end."
      >
        <SpecimenRow label="With the create action">
          <Pane>
            <RoutinesGridEmpty
              action={
                <Button>
                  <Plus className="size-4" />
                  New routine
                </Button>
              }
            />
          </Pane>
        </SpecimenRow>
        <SpecimenRow label="Text only">
          <Pane>
            <RoutinesGridEmpty />
          </Pane>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="All copy arrives through `labels`, so `ui/` stays i18n-agnostic; the English defaults below are `DEFAULT_GRID_LABELS`. The state has no loading or error shape of its own — `RoutinesGrid` gates those before it ever renders."
      >
        <SpecimenRow label="Localized labels (es)">
          <Pane>
            <RoutinesGridEmpty
              labels={{
                ...DEFAULT_GRID_LABELS,
                emptyTitle: "Aún no hay rutinas",
                emptyDescription:
                  "Crea la primera y Houston se encarga del resto.",
              }}
              action={<Button>Nueva rutina</Button>}
            />
          </Pane>
        </SpecimenRow>
        <SpecimenRow label="In a narrow pane">
          <div className="flex h-72 w-64 flex-col overflow-hidden rounded-xl border border-line bg-card/40">
            <RoutinesGridEmpty />
          </div>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "action",
            type: "ReactNode",
            note: "The primary create button, supplied by the app — `ui/` owns no navigation.",
          },
          {
            name: "labels",
            type: "RoutinesGridLabels",
            note: "Reads `emptyTitle` and `emptyDescription`. Defaults to `DEFAULT_GRID_LABELS`.",
          },
        ]}
      />

      <SpecimenTokens
        classes={["bg-transparent", "text-ink", "text-ink-muted"]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["RoutinesGridEmpty"];

export const specimen: Specimen = {
  id: "routines-grid-empty",
  title: "RoutinesGridEmpty",
  group: "Routines",
  render: () => <RoutinesGridEmptySpecimen />,
};

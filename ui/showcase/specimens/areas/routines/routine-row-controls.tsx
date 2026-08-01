import { DEFAULT_ROW_LABELS, RoutineRowControls } from "@houston-ai/routines";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { inboxZero } from "./sample";

/** The cluster as it ships: the switch commits immediately, the kebab confirms. */
function LiveControls() {
  const [enabled, setEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <RoutineRowControls
        name={inboxZero.name}
        enabled={enabled}
        labels={DEFAULT_ROW_LABELS}
        onToggle={setEnabled}
        runNow={running ? undefined : () => setRunning(true)}
        stopRun={running ? () => setRunning(false) : undefined}
        onDelete={() => setEnabled(false)}
      />
      <span className="text-ink-muted text-xs">
        {running ? "A run is in flight" : enabled ? "Scheduled" : "Paused"}
      </span>
    </div>
  );
}

function RoutineRowControlsSpecimen() {
  return (
    <SpecimenPage
      title="RoutineRowControls"
      intro="The row's trailing actions: pause or resume, and the kebab that runs, stops or deletes. Opening the routine's chat is the row itself, so it is deliberately not repeated here."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — the cluster is assembled from the handlers it is given. Pass none of `runNow`, `stopRun` or `onDelete` and the kebab drops; pass no `onToggle` either and the whole cluster renders nothing at all."
      >
        <SpecimenRow label="Switch and kebab (live)">
          <LiveControls />
        </SpecimenRow>
        <SpecimenRow label="Switch only">
          <RoutineRowControls
            name={inboxZero.name}
            enabled
            labels={DEFAULT_ROW_LABELS}
            onToggle={() => {}}
          />
        </SpecimenRow>
        <SpecimenRow label="Kebab only">
          <RoutineRowControls
            name={inboxZero.name}
            enabled
            labels={DEFAULT_ROW_LABELS}
            runNow={() => {}}
            onDelete={() => {}}
          />
        </SpecimenRow>
        <SpecimenRow label="No handlers — renders nothing">
          <RoutineRowControls
            name={inboxZero.name}
            enabled
            labels={DEFAULT_ROW_LABELS}
          />
          <span className="text-ink-muted text-xs">(nothing, by design)</span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The kebab offers exactly one run control, because only one is ever true: Stop while a run is in flight, Run now otherwise. Delete is separated by a rule and confirms in a dialog before it fires."
      >
        <SpecimenRow label="Enabled">
          <RoutineRowControls
            name={inboxZero.name}
            enabled
            labels={DEFAULT_ROW_LABELS}
            onToggle={() => {}}
            runNow={() => {}}
            onDelete={() => {}}
          />
        </SpecimenRow>
        <SpecimenRow label="Paused">
          <RoutineRowControls
            name={inboxZero.name}
            enabled={false}
            labels={DEFAULT_ROW_LABELS}
            onToggle={() => {}}
            runNow={() => {}}
            onDelete={() => {}}
          />
        </SpecimenRow>
        <SpecimenRow label="Run in flight — Stop run">
          <RoutineRowControls
            name={inboxZero.name}
            enabled
            labels={DEFAULT_ROW_LABELS}
            onToggle={() => {}}
            stopRun={() => {}}
            onDelete={() => {}}
          />
        </SpecimenRow>
        <SpecimenRow label="Delete only">
          <RoutineRowControls
            name={inboxZero.name}
            enabled
            labels={DEFAULT_ROW_LABELS}
            onToggle={() => {}}
            onDelete={() => {}}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps
        items={[
          {
            name: "name",
            type: "string",
            note: "Required. Fills `{name}` in the delete dialog's title.",
          },
          {
            name: "enabled",
            type: "boolean",
            note: "Required. Drives the switch and its accessible name (Pause / Resume routine).",
          },
          {
            name: "labels",
            type: "RoutineRowLabels",
            note: "Required — no default here. Callers pass `DEFAULT_ROW_LABELS` or `t()` results.",
          },
          {
            name: "onToggle",
            type: "(enabled: boolean) => void",
            note: "Omit to drop the switch. Its click never bubbles to the row.",
          },
          {
            name: "runNow / stopRun",
            type: "() => void",
            note: "The row passes whichever fits the current run state, never both.",
          },
          {
            name: "onDelete",
            type: "() => void",
            note: "Called only after the confirm dialog resolves.",
          },
        ]}
      />

      <SpecimenTokens
        classes={[
          "bg-action",
          "bg-input",
          "ring-focus",
          "text-ink",
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
export const sources: string[] = ["RoutineRowControls"];

export const specimen: Specimen = {
  id: "routines-row-controls",
  title: "RoutineRowControls",
  group: "Routines",
  render: () => <RoutineRowControlsSpecimen />,
};

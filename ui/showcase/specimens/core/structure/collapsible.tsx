import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
} from "../../../src/specimen";

const steps = [
  "Read 41 unread threads",
  "Archived 12 newsletters",
  "Drafted 6 replies for approval",
];

/**
 * The primitive ships no styles, so every example spells its own chrome — which
 * is the point: `Collapsible` is the show/hide behaviour and nothing else.
 */
function RunDetails({
  defaultOpen,
  disabled,
}: {
  defaultOpen?: boolean;
  disabled?: boolean;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      disabled={disabled}
      className="w-full max-w-sm rounded-xl border border-line bg-card"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="group w-full justify-between px-4 py-3 disabled:opacity-50"
        >
          <span className="text-sm">Run 142 · Inbox Zero</span>
          <ChevronDown className="size-4 text-ink-muted transition-transform group-data-[state=open]:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-1 border-line border-t px-4 py-3 text-ink-muted text-sm">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

const props: SpecimenProp[] = [
  {
    name: "Collapsible.open / defaultOpen",
    type: "boolean",
    note: "Radix Collapsible.Root — controlled or uncontrolled.",
  },
  {
    name: "Collapsible.onOpenChange",
    type: "(open: boolean) => void",
    note: "Fires on every open/close.",
  },
  {
    name: "Collapsible.disabled",
    type: "boolean",
    note: "Freezes the current state; the trigger stops responding.",
  },
  {
    name: "CollapsibleTrigger.asChild",
    type: "boolean",
    note: "Merges the trigger onto your own element — a Button, a row, a header.",
  },
  {
    name: "CollapsibleContent.forceMount",
    type: "boolean",
    note: "Keeps the panel mounted while closed, for your own animation.",
  },
];

function CollapsibleSpecimen() {
  return (
    <SpecimenPage
      title="Collapsible"
      intro="The bare show/hide primitive: one trigger, one panel, no opinion about how either looks."
    >
      <SpecimenSection
        title="Variants"
        note="None. The component is unstyled by design — it forwards Radix's three parts and adds only data-slot hooks. The chrome below belongs to the example, not the component."
      >
        <SpecimenRow label="Closed by default">
          <RunDetails />
        </SpecimenRow>
        <SpecimenRow label="defaultOpen">
          <RunDetails defaultOpen />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="data-state=&quot;open&quot; | &quot;closed&quot; lands on all three parts, so the trigger's chevron and the panel can be styled from the parent."
      >
        <SpecimenRow label="Open">
          <RunDetails defaultOpen />
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <RunDetails disabled />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      {/* No `SpecimenTokens`: the component paints nothing at all — it renders
          three Radix primitives with `data-slot` hooks and no className of its
          own, so there is no token list to audit. Every colour on this page
          belongs to the example's chrome. */}
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Collapsible",
  "CollapsibleContent",
  "CollapsibleTrigger",
];

export const specimen: Specimen = {
  id: "core-collapsible",
  title: "Collapsible",
  group: "Structure & nav",
  render: () => <CollapsibleSpecimen />,
};

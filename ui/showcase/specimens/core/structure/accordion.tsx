import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@houston-ai/core";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

const faq = [
  {
    id: "schedule",
    question: "When does Inbox Zero run?",
    answer:
      "Every weekday at 08:00 in your timezone. You can change the schedule, or run it by hand from the agent page.",
  },
  {
    id: "approve",
    question: "Does it send replies on its own?",
    answer:
      "No. It drafts, you approve. Nothing leaves your mailbox until you press send.",
  },
  {
    id: "access",
    question: "What can it read?",
    answer:
      "Only the mailbox you connected, and only threads from the last 30 days.",
  },
];

const props: SpecimenProp[] = [
  {
    name: "Accordion.type",
    type: '"single" | "multiple"',
    note: "Radix Accordion.Root — one section open at a time, or many.",
  },
  {
    name: "Accordion.collapsible",
    type: "boolean",
    note: 'Only with type="single": lets the open section close again.',
  },
  {
    name: "Accordion.value / defaultValue",
    type: "string | string[]",
    note: "Controlled or uncontrolled open section(s).",
  },
  {
    name: "Accordion.onValueChange",
    type: "(value: string | string[]) => void",
    note: "Fires when a section opens or closes.",
  },
  {
    name: "AccordionItem.value",
    type: "string",
    note: "Identifies the section; required.",
  },
  {
    name: "AccordionItem.disabled",
    type: "boolean",
    note: "Locks the section closed and drops it to 50% opacity.",
  },
  {
    name: "AccordionTrigger.children",
    type: "React.ReactNode",
    note: "The heading row. A chevron is appended and rotates on open.",
  },
];

const tokens = ["border-b", "text-ink-muted", "border-focus", "ring-focus/50"];

function FaqItems({ disabledId }: { disabledId?: string }) {
  return (
    <>
      {faq.map((entry) => (
        <AccordionItem
          key={entry.id}
          value={entry.id}
          disabled={entry.id === disabledId}
        >
          <AccordionTrigger>{entry.question}</AccordionTrigger>
          <AccordionContent className="text-ink-muted">
            {entry.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </>
  );
}

function AccordionSpecimen() {
  return (
    <SpecimenPage
      title="Accordion"
      intro="Folds a list of long answers down to their headings — an agent's FAQ, a settings group, a run's detail."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants: the root's type prop is the whole shape of the component."
      >
        <SpecimenRow label='type="single" collapsible'>
          <Accordion
            type="single"
            collapsible
            defaultValue="schedule"
            className="w-full max-w-md"
          >
            <FaqItems />
          </Accordion>
        </SpecimenRow>
        <SpecimenRow label='type="multiple"'>
          <Accordion
            type="multiple"
            defaultValue={["schedule", "approve"]}
            className="w-full max-w-md"
          >
            <FaqItems />
          </Accordion>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="A trigger underlines on hover and takes a focus ring on keyboard focus."
      >
        <SpecimenRow label="Closed / open">
          <Accordion
            type="single"
            collapsible
            defaultValue="approve"
            className="w-full max-w-md"
          >
            <FaqItems />
          </Accordion>
        </SpecimenRow>
        <SpecimenRow label="Disabled item">
          <Accordion type="single" collapsible className="w-full max-w-md">
            <FaqItems disabledId="access" />
          </Accordion>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />
      <SpecimenTokens classes={tokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Accordion",
  "AccordionContent",
  "AccordionItem",
  "AccordionTrigger",
];

export const specimen: Specimen = {
  id: "core-accordion",
  title: "Accordion",
  group: "Structure & nav",
  render: () => <AccordionSpecimen />,
};

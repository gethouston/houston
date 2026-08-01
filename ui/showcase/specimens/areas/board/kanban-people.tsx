import { initialsFor, KanbanPeople } from "@houston-ai/board";
import { cn, TooltipProvider } from "@houston-ai/core";
import { storeSurface, storeType } from "@houston-ai/store";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { PEOPLE_PROPS } from "./kanban-people-parts";
import { PEOPLE } from "./sample";

/** Labels whose initials are worth showing: two words, one word, an accent. */
const INITIALS = ["Ana Silva", "julian", "Tomás Vidal", "Rin Watanabe"];

/** A face stack is only honest on the surface it was ringed for. */
function Surface({
  tone,
  children,
}: {
  tone: string;
  children: React.ReactNode;
}) {
  return <div className={cn("rounded-xl p-3", tone)}>{children}</div>;
}

function KanbanPeopleSpecimen() {
  return (
    <TooltipProvider>
      <SpecimenPage
        title="KanbanPeople"
        intro="The teammates on a mission, as an overlapping face stack: up to `max` faces, then a +N chip that opens the full list."
      >
        <SpecimenSection
          title="Variants"
          note="`surface` is the variant axis, and it is not decoration: each face carries a 2px ring painted in the surface's own colour, which is what makes an overlapped face read as a cutout instead of a halo. Pass the surface the stack actually sits on."
        >
          <SpecimenRow label='surface="input" (a card)'>
            <Surface tone="bg-input">
              <KanbanPeople people={PEOPLE.slice(0, 3)} />
            </Surface>
          </SpecimenRow>
          <SpecimenRow label='surface="background" (the panel header)'>
            <Surface tone="bg-background">
              <KanbanPeople
                people={PEOPLE.slice(0, 3)}
                size="md"
                surface="background"
              />
            </Surface>
          </SpecimenRow>
          <SpecimenRow label="Overflow: static chip / expandable">
            <Surface tone="bg-input">
              <KanbanPeople people={PEOPLE} max={3} />
            </Surface>
            <Surface tone="bg-input">
              <KanbanPeople
                people={PEOPLE}
                max={3}
                expandable
                expandLabel="All people"
              />
            </Surface>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="States"
          note="No people, no stack: the component returns nothing rather than an empty rail, so an unattributed mission renders byte-identically to a single-player board. Tone is a property of the PERSON, not of the list — it is hashed from their id, so the same teammate wears one colour on every card."
        >
          <SpecimenRow label="One person / none">
            <Surface tone="bg-input">
              <KanbanPeople people={[PEOPLE[0]]} />
            </Surface>
            <Surface tone="bg-input">
              <KanbanPeople people={[]} />
            </Surface>
            <span className={storeType.meta}>Nothing rendered.</span>
          </SpecimenRow>
          <SpecimenRow label="The five person tones">
            <Surface tone="bg-input">
              <KanbanPeople people={PEOPLE} max={PEOPLE.length} />
            </Surface>
          </SpecimenRow>
          <SpecimenRow label="initialsFor">
            {INITIALS.map((label) => (
              <span key={label} className="flex items-center gap-2">
                <code className={cn(storeSurface.chip, "font-mono")}>
                  {initialsFor(label)}
                </code>
                <span className={storeType.meta}>{label}</span>
              </span>
            ))}
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenSection
          title="Sizes"
          note="Two: `sm` (18px) for the dense card overlay, `md` (24px) for the detail panel header and the rows inside the expansion popover."
        >
          <SpecimenRow label="sm / md">
            <Surface tone="bg-input">
              <KanbanPeople people={PEOPLE.slice(0, 3)} size="sm" />
            </Surface>
            <Surface tone="bg-input">
              <KanbanPeople people={PEOPLE.slice(0, 3)} size="md" />
            </Surface>
          </SpecimenRow>
        </SpecimenSection>

        <SpecimenProps items={PEOPLE_PROPS} />

        <SpecimenTokens
          classes={[
            "bg-person-slate",
            "bg-person-sage",
            "bg-person-mauve",
            "bg-person-taupe",
            "bg-person-indigo",
            "text-person-initials",
            "bg-person-overflow",
            "text-person-overflow-text",
            "ring-input",
            "ring-background",
            "text-ink",
          ]}
        />
      </SpecimenPage>
    </TooltipProvider>
  );
}

export const sources: string[] = [
  "KanbanPeople",
  "initialsFor",
  "personToneClass",
];

export const specimen: Specimen = {
  id: "board-kanban-people",
  title: "KanbanPeople",
  group: "Activity",
  render: () => <KanbanPeopleSpecimen />,
};

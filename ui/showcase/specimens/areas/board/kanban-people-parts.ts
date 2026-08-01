import type { SpecimenProp } from "../../../src/specimen";

/** `KanbanPeopleProps`, read off the component's TypeScript types. */
export const PEOPLE_PROPS: SpecimenProp[] = [
  {
    name: "people",
    type: "KanbanPerson[]",
    note: "Faces to draw. Empty or absent renders nothing at all.",
  },
  {
    name: "max",
    type: "number",
    note: "Faces before the +N chip. Default 3; the card passes CARD_PEOPLE_MAX (5).",
  },
  {
    name: "size",
    type: '"sm" | "md"',
    note: "18px for cards, 24px for the panel header. Default `sm`.",
  },
  {
    name: "surface",
    type: '"input" | "background"',
    note: "The tone under the stack, which the face rings are painted in. Default `input`.",
  },
  {
    name: "label",
    type: "string",
    note: 'Accessible group label, already translated. Default "People".',
  },
  {
    name: "expandable",
    type: "boolean",
    note: "Turns the +N chip into a popover listing every person. Default false.",
  },
  {
    name: "expandLabel",
    type: "string",
    note: "Accessible label for that trigger. Only read when `expandable`.",
  },
  {
    name: "className",
    type: "string",
    note: "Merged onto the group — how the card floats the stack over its body.",
  },
];

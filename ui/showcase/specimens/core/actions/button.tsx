import { Button } from "@houston-ai/core";
import {
  ArrowUpRight,
  Copy,
  Pencil,
  Play,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/** Every `variant` the button's cva declares, paired with a real action. */
const VARIANTS = [
  { name: "default", label: "Deploy agent", icon: Play },
  { name: "destructive", label: "Delete agent", icon: Trash2 },
  { name: "outline", label: "Duplicate", icon: Copy },
  { name: "secondary", label: "Share", icon: Share2 },
  { name: "ghost", label: "Rename", icon: Pencil },
  { name: "link", label: "View in store", icon: ArrowUpRight },
] as const;

/** The label sizes, smallest first. `default` is what you get unset. */
const TEXT_SIZES = ["xs", "sm", "default", "lg"] as const;

/** The square sizes, for a button whose whole label is its icon. */
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

const props: readonly SpecimenProp[] = [
  {
    name: "variant",
    type: '"default" | "destructive" | "outline" | "secondary" | "ghost" | "link"',
    note: "Defaults to `default`.",
  },
  {
    name: "size",
    type: '"default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"',
    note: "Defaults to `default` (h-9). The `icon-*` sizes are square.",
  },
  {
    name: "asChild",
    type: "boolean",
    note: "Render the child element instead of a `<button>`. Defaults to `false`.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "Drops to 50% and stops taking the pointer.",
  },
  {
    name: "aria-invalid",
    type: "boolean",
    note: "Paints the border and focus ring in `danger`.",
  },
  {
    name: "...props",
    type: 'React.ComponentProps<"button">',
    note: "Everything else lands on the underlying element.",
  },
];

const tokens = [
  "bg-action",
  "text-action-text",
  "bg-danger",
  "ring-danger",
  "bg-input",
  "border-line-input",
  "bg-hover",
  "text-hover-text",
  "bg-chip",
  "text-chip-text",
  "text-action",
  "border-focus",
  "ring-focus",
];

function ButtonSpecimen() {
  return (
    <SpecimenPage
      title="Button"
      intro="The action primitive: a pill, one accent per view, six variants and eight sizes."
    >
      <SpecimenSection
        title="Variants"
        note="Six, and no more. Each row shows the variant with a label alone and with a leading icon, where the padding tightens on its own when an icon is present."
      >
        {VARIANTS.map(({ name, label, icon: Icon }) => (
          <SpecimenRow key={name} label={name}>
            <Button variant={name}>{label}</Button>
            <Button variant={name}>
              <Icon />
              {label}
            </Button>
          </SpecimenRow>
        ))}
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Hover and focus are live: point at a button, or tab to one to see the 3px focus ring resolve the near-ink focus token rather than a blue default."
      >
        <SpecimenRow label="Default">
          <Button>Deploy agent</Button>
          <Button variant="outline">Cancel</Button>
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <Button disabled>Deploy agent</Button>
          <Button variant="outline" disabled>
            Cancel
          </Button>
          <Button variant="destructive" disabled>
            Delete agent
          </Button>
        </SpecimenRow>
        <SpecimenRow label="Invalid">
          <Button variant="outline" aria-invalid>
            Pick a model
          </Button>
        </SpecimenRow>
        <SpecimenRow label="Icon only">
          <Button size="icon" aria-label="Add an agent">
            <Plus />
          </Button>
          <Button size="icon" variant="outline" aria-label="Share Inbox Zero">
            <Share2 />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Rename Inbox Zero">
            <Pencil />
          </Button>
        </SpecimenRow>
        <SpecimenRow label="asChild (anchor)">
          <Button asChild variant="link">
            <a href="#core-async-button">
              Async button
              <ArrowUpRight />
            </a>
          </Button>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Labelled sizes set the height and the horizontal padding; the icon sizes are square, and shrink the glyph with them."
      >
        {TEXT_SIZES.map((size) => (
          <SpecimenRow key={size} label={size}>
            <Button size={size}>Deploy agent</Button>
            <Button size={size} variant="outline">
              <Play />
              Run once
            </Button>
          </SpecimenRow>
        ))}
        {ICON_SIZES.map((size) => (
          <SpecimenRow key={size} label={size}>
            <Button size={size} aria-label="Add an agent">
              <Plus />
            </Button>
            <Button size={size} variant="outline" aria-label="Add an agent">
              <Plus />
            </Button>
          </SpecimenRow>
        ))}
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
export const sources: string[] = ["Button"];

export const specimen: Specimen = {
  id: "core-button",
  title: "Button",
  group: "Actions & inputs",
  render: () => <ButtonSpecimen />,
};

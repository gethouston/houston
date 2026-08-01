import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@houston-ai/core";
import { Search } from "lucide-react";
import type { ReactNode } from "react";

import {
  type SpecimenProp,
  SpecimenRow,
  SpecimenSection,
} from "../../../src/specimen";

/** The group is `w-full`; this is the form column it normally sits in. */
export function Field({ children }: { children: ReactNode }) {
  return <div className="w-80 max-w-full">{children}</div>;
}

const BUTTON_SIZES = ["xs", "sm", "icon-xs", "icon-sm"] as const;

/** The second cva on this page: the sizes `InputGroupButton` declares. */
export function InputGroupSizes() {
  return (
    <SpecimenSection
      title="Sizes"
      note="`InputGroupButton` carries the sizes. It defaults to `xs` and to the ghost variant, so it never competes with the field it sits in."
    >
      {BUTTON_SIZES.map((size) => (
        <SpecimenRow key={size} label={size}>
          <Field>
            <InputGroup>
              <InputGroupInput
                placeholder="Search agents"
                aria-label="Search"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size={size} aria-label="Search">
                  {size.startsWith("icon") ? <Search /> : "Search"}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </SpecimenRow>
      ))}
    </SpecimenSection>
  );
}

/**
 * The input-group page's tables, split out so the page itself stays under the
 * 200-line rule. Read off `ui/core/src/components/input-group.tsx`.
 */
export const inputGroupProps: readonly SpecimenProp[] = [
  {
    name: "InputGroup",
    type: 'React.ComponentProps<"fieldset">',
    note: "The bordered wrapper. Owns focus and error styling for the whole control.",
  },
  {
    name: "InputGroupAddon.align",
    type: '"inline-start" | "inline-end" | "block-start" | "block-end"',
    note: "Defaults to `inline-start`. The block aligns turn the group into a column.",
  },
  {
    name: "InputGroupButton.size",
    type: '"xs" | "sm" | "icon-xs" | "icon-sm"',
    note: "Defaults to `xs`. Independent of Button's own size scale.",
  },
  {
    name: "InputGroupButton.variant",
    type: "Button's `variant`",
    note: "Defaults to `ghost`, and `type` defaults to `button` so it never submits a form by accident.",
  },
  {
    name: "InputGroupInput",
    type: 'React.ComponentProps<"input">',
    note: "An Input marked `data-slot=input-group-control`; that marker is what the group watches for focus and `aria-invalid`.",
  },
  {
    name: "InputGroupTextarea",
    type: 'React.ComponentProps<"textarea">',
    note: "The same marker on a Textarea; the group grows to fit it.",
  },
  {
    name: "InputGroupText",
    type: 'React.ComponentProps<"span">',
    note: "Muted inline label: a unit, a suffix, a prompt.",
  },
];

export const inputGroupTokens = [
  "border-line-input",
  "dark:bg-line-input/30",
  "text-ink-muted",
  "border-focus",
  "ring-focus",
  "border-danger",
  "ring-danger",
];

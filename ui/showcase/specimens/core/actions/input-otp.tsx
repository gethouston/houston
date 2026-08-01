import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS,
} from "@houston-ai/core";
import { useState } from "react";

import {
  type Specimen,
  SpecimenPage,
  type SpecimenProp,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";

/**
 * Every example is live: type into one, paste a code into it, backspace back
 * out of it. `layout` is how many slots sit in each group.
 */
function Otp({
  initial = "",
  layout = [6],
  disabled,
  invalid,
  slotClassName,
}: {
  initial?: string;
  layout?: readonly number[];
  disabled?: boolean;
  invalid?: boolean;
  slotClassName?: string;
}) {
  const [value, setValue] = useState(initial);
  const maxLength = layout.reduce((total, count) => total + count, 0);
  const groups = layout.map((count, group) => ({
    count,
    offset: layout.slice(0, group).reduce((total, each) => total + each, 0),
  }));

  return (
    <InputOTP
      maxLength={maxLength}
      value={value}
      onChange={setValue}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      disabled={disabled}
      aria-label="Sign-in code"
    >
      {groups.map(({ count, offset }) => (
        <InputOTPGroup key={offset}>
          {Array.from({ length: count }, (_, slot) => offset + slot).map(
            (index) => (
              <InputOTPSlot
                key={index}
                index={index}
                aria-invalid={invalid}
                className={slotClassName}
              />
            ),
          )}
        </InputOTPGroup>
      ))}
    </InputOTP>
  );
}

const props: readonly SpecimenProp[] = [
  {
    name: "maxLength",
    type: "number",
    note: "How many characters the code has; it must equal the number of slots you render.",
  },
  {
    name: "value / onChange",
    type: "string / (value: string) => void",
    note: "Controlled, like any field.",
  },
  {
    name: "onComplete",
    type: "(value: string) => void",
    note: "Fires the moment the last slot fills. Verify from here, not from a submit button.",
  },
  {
    name: "pattern",
    type: "string",
    note: "`REGEXP_ONLY_DIGITS` is re-exported for the common case.",
  },
  {
    name: "disabled",
    type: "boolean",
    note: "Fades the whole row via `has-disabled` on the container.",
  },
  {
    name: "containerClassName",
    type: "string",
    note: "Styles the slot row; `className` styles the invisible input behind it.",
  },
  {
    name: "InputOTPSlot.index",
    type: "number",
    note: "Which character of the code this box shows. Zero-based.",
  },
];

const tokens = [
  "border-line-input",
  "text-ink",
  "dark:bg-line-input/30",
  "data-[active=true]:border-focus",
  "aria-invalid:border-danger",
  "bg-ink",
];

function InputOTPSpecimen() {
  return (
    <SpecimenPage
      title="Input OTP"
      intro="One-time-code entry: a box per character, auto-advance, backspace navigation, and paste that distributes across the slots."
    >
      <SpecimenSection
        title="Variants"
        note="No variant prop. What changes is how you group the slots. Separate boxes with a gap, never a joined segmented field."
      >
        <SpecimenRow label="Six, one group">
          <Otp initial="4821" />
        </SpecimenRow>
        <SpecimenRow label="Six, two groups of three">
          <Otp layout={[3, 3]} initial="482913" />
        </SpecimenRow>
        <SpecimenRow label="Four digits">
          <Otp layout={[4]} />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The active slot marks itself with the focus border and a blinking caret, the same focus language as every other field."
      >
        <SpecimenRow label="Empty">
          <Otp />
        </SpecimenRow>
        <SpecimenRow label="Partially filled">
          <Otp initial="482" />
        </SpecimenRow>
        <SpecimenRow label="Complete">
          <Otp initial="482913" />
        </SpecimenRow>
        <SpecimenRow label="Invalid">
          <Otp initial="482913" invalid />
          <span className="text-danger text-sm">
            That code expired. We sent a new one to julian@gethouston.ai.
          </span>
        </SpecimenRow>
        <SpecimenRow label="Disabled (verifying)">
          <Otp initial="482913" disabled />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="The slot is a fixed 36px square. A screen that needs more presence overrides it on the slot; the sign-in step uses 40px."
      >
        <SpecimenRow label="Default (size-9)">
          <Otp initial="4829" />
        </SpecimenRow>
        <SpecimenRow label="Override (size-10)">
          <Otp initial="4829" slotClassName="size-10" />
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
  "InputOTP",
  "InputOTPGroup",
  "InputOTPSlot",
  "REGEXP_ONLY_DIGITS",
];

export const specimen: Specimen = {
  id: "core-input-otp",
  title: "Input OTP",
  group: "Actions & inputs",
  render: () => <InputOTPSpecimen />,
};

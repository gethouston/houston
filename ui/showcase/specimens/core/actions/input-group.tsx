import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  Kbd,
} from "@houston-ai/core";
import { ArrowUp, AtSign, Paperclip, Search, Send, X } from "lucide-react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  Field,
  InputGroupSizes,
  inputGroupProps,
  inputGroupTokens,
} from "./input-group-parts";

function InputGroupSpecimen() {
  return (
    <SpecimenPage
      title="Input group"
      intro="A field and its furniture in one bordered fieldset: icons, labels, shortcuts and buttons that sit inside the control and share its focus ring."
    >
      <SpecimenSection
        title="Variants"
        note="`InputGroupAddon` takes an `align`, and that is what reshapes the group: the inline aligns keep it one row, the block aligns stack it into a column."
      >
        <SpecimenRow label="inline-start">
          <Field>
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search agents"
                aria-label="Search"
              />
            </InputGroup>
          </Field>
        </SpecimenRow>
        <SpecimenRow label="inline-end">
          <Field>
            <InputGroup>
              <InputGroupInput
                placeholder="Search agents"
                aria-label="Search"
              />
              <InputGroupAddon align="inline-end">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </SpecimenRow>
        <SpecimenRow label="block-start">
          <Field>
            <InputGroup>
              <InputGroupAddon align="block-start">
                <InputGroupText>Ask Inbox Zero</InputGroupText>
              </InputGroupAddon>
              <InputGroupTextarea
                placeholder="Draft a reply to the Acme thread"
                aria-label="Message"
              />
            </InputGroup>
          </Field>
        </SpecimenRow>
        <SpecimenRow label="block-end">
          <Field>
            <InputGroup>
              <InputGroupTextarea
                placeholder="Draft a reply to the Acme thread"
                aria-label="Message"
              />
              <InputGroupAddon align="block-end">
                <InputGroupButton size="icon-xs" aria-label="Attach a file">
                  <Paperclip />
                </InputGroupButton>
                <InputGroupButton
                  size="icon-xs"
                  variant="default"
                  className="ml-auto"
                  aria-label="Send"
                >
                  <ArrowUp />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Focus lives on the group, not the input: click anywhere inside and the whole fieldset takes the ring. The addons are `cursor-text`, so clicking one focuses the control."
      >
        <SpecimenRow label="Default">
          <Field>
            <InputGroup>
              <InputGroupAddon>
                <AtSign />
              </InputGroupAddon>
              <InputGroupInput
                defaultValue="julian"
                aria-label="Store handle"
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>@gethouston.ai</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </SpecimenRow>
        <SpecimenRow label="With a clear button">
          <Field>
            <InputGroup>
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput defaultValue="meeting" aria-label="Search" />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="icon-xs" aria-label="Clear search">
                  <X />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Invalid">
          <Field>
            <InputGroup>
              <InputGroupAddon>
                <AtSign />
              </InputGroupAddon>
              <InputGroupInput
                aria-invalid
                defaultValue="Meeting Notes!"
                aria-label="Store handle"
              />
            </InputGroup>
          </Field>
          <span className="text-danger text-sm">Handle is already taken.</span>
        </SpecimenRow>
        <SpecimenRow label="Disabled">
          <Field>
            <InputGroup data-disabled="true">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                disabled
                placeholder="Search agents"
                aria-label="Search"
              />
            </InputGroup>
          </Field>
        </SpecimenRow>
        <SpecimenRow label="Textarea control">
          <Field>
            <InputGroup>
              <InputGroupTextarea
                defaultValue="Summarise the standup and file the follow-ups."
                aria-label="Instructions"
              />
              <InputGroupAddon align="block-end">
                <InputGroupButton size="sm">
                  <Send />
                  Send
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </SpecimenRow>
      </SpecimenSection>

      <InputGroupSizes />

      <SpecimenProps items={inputGroupProps} />
      <SpecimenTokens classes={inputGroupTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "InputGroup",
  "InputGroupAddon",
  "InputGroupButton",
  "InputGroupInput",
  "InputGroupText",
  "InputGroupTextarea",
];

export const specimen: Specimen = {
  id: "core-input-group",
  title: "Input group",
  group: "Actions & inputs",
  render: () => <InputGroupSpecimen />,
};

import {
  Button,
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import {
  AlignLeft,
  Bold,
  ChevronDown,
  Copy,
  Italic,
  Pause,
  Play,
  Square,
  Underline,
} from "lucide-react";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { buttonGroupProps, buttonGroupTokens } from "./button-group-parts";

function ButtonGroupSpecimen() {
  return (
    <SpecimenPage
      title="Button group"
      intro="A fieldset that welds buttons, labels and fields into one control: shared edges, one focus ring at a time."
    >
      <SpecimenSection
        title="Variants"
        note="Orientation decides which edge is shared: horizontal drops the inner left/right corners, vertical the top/bottom ones."
      >
        <SpecimenRow label="horizontal">
          <ButtonGroup>
            <Button variant="outline" aria-label="Bold">
              <Bold />
            </Button>
            <Button variant="outline" aria-label="Italic">
              <Italic />
            </Button>
            <Button variant="outline" aria-label="Underline">
              <Underline />
            </Button>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="vertical">
          <ButtonGroup orientation="vertical">
            <Button variant="outline">
              <Play />
              Run
            </Button>
            <Button variant="outline">
              <Pause />
              Pause
            </Button>
            <Button variant="outline">
              <Square />
              Stop
            </Button>
          </ButtonGroup>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Focus lifts a segment above its neighbours so the ring is never clipped. `disabled` on the fieldset takes the whole group down at once."
      >
        <SpecimenRow label="With a text label">
          <ButtonGroup>
            <ButtonGroupText>Runs every</ButtonGroupText>
            <Button variant="outline">15 min</Button>
            <Button variant="outline">
              <ChevronDown />
            </Button>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="With a separator">
          <ButtonGroup>
            <Button variant="outline">
              <Play />
              Run Inbox Zero
            </Button>
            <ButtonGroupSeparator />
            <Button variant="outline" aria-label="More run options">
              <ChevronDown />
            </Button>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="With a field">
          <ButtonGroup>
            <Input
              defaultValue="agents.gethouston.ai/inbox-zero"
              aria-label="Agent link"
              readOnly
            />
            <Button variant="outline">
              <Copy />
              Copy
            </Button>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="With a select">
          <ButtonGroup>
            <Select defaultValue="every-15">
              <SelectTrigger aria-label="Schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="every-15">Every 15 minutes</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily at 09:00</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline">Save</Button>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="Nested groups">
          <ButtonGroup>
            <ButtonGroup>
              <Button variant="outline" aria-label="Align left">
                <AlignLeft />
              </Button>
              <Button variant="outline" aria-label="Bold">
                <Bold />
              </Button>
            </ButtonGroup>
            <ButtonGroup>
              <Button variant="outline">Draft</Button>
              <Button variant="outline">Published</Button>
            </ButtonGroup>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="Disabled (fieldset)">
          <ButtonGroup disabled>
            <Button variant="outline">Draft</Button>
            <Button variant="outline">Published</Button>
            <Button variant="outline">Archived</Button>
          </ButtonGroup>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="The group has no size of its own; it takes the height of the buttons inside, so keep one size per group."
      >
        <SpecimenRow label="sm buttons">
          <ButtonGroup>
            <Button variant="outline" size="sm">
              Draft
            </Button>
            <Button variant="outline" size="sm">
              Published
            </Button>
          </ButtonGroup>
        </SpecimenRow>
        <SpecimenRow label="default buttons">
          <ButtonGroup>
            <Button variant="outline">Draft</Button>
            <Button variant="outline">Published</Button>
          </ButtonGroup>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={buttonGroupProps} />
      <SpecimenTokens classes={buttonGroupTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "ButtonGroup",
  "ButtonGroupSeparator",
  "ButtonGroupText",
];

export const specimen: Specimen = {
  id: "core-button-group",
  title: "Button group",
  group: "Actions & inputs",
  render: () => <ButtonGroupSpecimen />,
};

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@houston-ai/core";
import { CheckIcon } from "lucide-react";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { AVATAR_PROPS, AVATAR_TOKENS } from "./avatar-parts";
import { BROKEN_AVATAR_URL, SAMPLE_PERSON_AVATAR } from "./sample-avatar";

const TEAM = ["JR", "MB", "AL"];

function AvatarSpecimen() {
  return (
    <SpecimenPage
      title="Avatar"
      intro="A person or agent's face: a photo when it loads, initials when it does not."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop — the shapes come from which of the six parts you compose."
      >
        <SpecimenRow label="Image">
          <Avatar>
            <AvatarImage src={SAMPLE_PERSON_AVATAR} alt="" />
            <AvatarFallback>JR</AvatarFallback>
          </Avatar>
        </SpecimenRow>
        <SpecimenRow label="Fallback (initials)">
          <Avatar>
            <AvatarFallback>JR</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>MB</AvatarFallback>
          </Avatar>
        </SpecimenRow>
        <SpecimenRow label="With AvatarBadge">
          <Avatar>
            <AvatarImage src={SAMPLE_PERSON_AVATAR} alt="" />
            <AvatarFallback>JR</AvatarFallback>
            <AvatarBadge />
          </Avatar>
          <Avatar>
            <AvatarFallback>MB</AvatarFallback>
            <AvatarBadge>
              <CheckIcon />
            </AvatarBadge>
          </Avatar>
        </SpecimenRow>
        <SpecimenRow label="AvatarGroup + count">
          <AvatarGroup>
            {TEAM.map((initials) => (
              <Avatar key={initials}>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            ))}
            <AvatarGroupCount>+4</AvatarGroupCount>
          </AvatarGroup>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Radix swaps image for fallback on its own: the image element stays hidden until it loads, and a failed load never flashes a broken glyph."
      >
        <SpecimenRow label="Image loads">
          <Avatar>
            <AvatarImage src={SAMPLE_PERSON_AVATAR} alt="" />
            <AvatarFallback>JR</AvatarFallback>
          </Avatar>
        </SpecimenRow>
        <SpecimenRow label="Image fails → fallback">
          <Avatar>
            <AvatarImage src={BROKEN_AVATAR_URL} alt="" />
            <AvatarFallback>JR</AvatarFallback>
          </Avatar>
          <span className="text-[13px] leading-[1.4] text-ink-muted">
            The same markup, pointed at a URL that never resolves.
          </span>
        </SpecimenRow>
        <SpecimenRow label="No src at all">
          <Avatar>
            <AvatarFallback>?</AvatarFallback>
          </Avatar>
        </SpecimenRow>
        <SpecimenRow label="Badge hides its icon at sm">
          <Avatar size="sm">
            <AvatarFallback>JR</AvatarFallback>
            <AvatarBadge>
              <CheckIcon />
            </AvatarBadge>
          </Avatar>
          <Avatar size="default">
            <AvatarFallback>JR</AvatarFallback>
            <AvatarBadge>
              <CheckIcon />
            </AvatarBadge>
          </Avatar>
          <Avatar size="lg">
            <AvatarFallback>JR</AvatarFallback>
            <AvatarBadge>
              <CheckIcon />
            </AvatarBadge>
          </Avatar>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="`size` on the root; the fallback type scale, the badge and the group count all follow it."
      >
        <SpecimenRow label="sm — 24px">
          <Avatar size="sm">
            <AvatarImage src={SAMPLE_PERSON_AVATAR} alt="" />
            <AvatarFallback>JR</AvatarFallback>
          </Avatar>
          <AvatarGroup>
            <Avatar size="sm">
              <AvatarFallback>JR</AvatarFallback>
            </Avatar>
            <Avatar size="sm">
              <AvatarFallback>MB</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+4</AvatarGroupCount>
          </AvatarGroup>
        </SpecimenRow>
        <SpecimenRow label="default — 32px">
          <Avatar>
            <AvatarImage src={SAMPLE_PERSON_AVATAR} alt="" />
            <AvatarFallback>JR</AvatarFallback>
          </Avatar>
          <AvatarGroup>
            <Avatar>
              <AvatarFallback>JR</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>MB</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+4</AvatarGroupCount>
          </AvatarGroup>
        </SpecimenRow>
        <SpecimenRow label="lg — 40px">
          <Avatar size="lg">
            <AvatarImage src={SAMPLE_PERSON_AVATAR} alt="" />
            <AvatarFallback>JR</AvatarFallback>
          </Avatar>
          <AvatarGroup>
            <Avatar size="lg">
              <AvatarFallback>JR</AvatarFallback>
            </Avatar>
            <Avatar size="lg">
              <AvatarFallback>MB</AvatarFallback>
            </Avatar>
            <AvatarGroupCount>+4</AvatarGroupCount>
          </AvatarGroup>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={AVATAR_PROPS} />
      <SpecimenTokens classes={AVATAR_TOKENS} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Avatar",
  "AvatarBadge",
  "AvatarFallback",
  "AvatarGroup",
  "AvatarGroupCount",
  "AvatarImage",
];

export const specimen: Specimen = {
  id: "core-avatar",
  title: "Avatar",
  group: "Data display",
  render: () => <AvatarSpecimen />,
};

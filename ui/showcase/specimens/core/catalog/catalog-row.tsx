import {
  Badge,
  CatalogAddButton,
  CatalogRow,
  StatusBadge,
  StatusDot,
} from "@houston-ai/core";
import { Lock } from "lucide-react";
import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { Measure, rowProps } from "./catalog-row-parts";
import { availableAgents, SampleIcon, sampleApp } from "./sample";

function CatalogRowSpecimen() {
  const [first, second] = availableAgents;
  return (
    <SpecimenPage
      title="Catalog row"
      intro="The flat catalog row: a full-width body button that opens the item, plus an optional interactive action at the right edge. Both paint the same hover fill."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants — the row varies by which slots it is given."
      >
        <SpecimenRow label="Title only">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={first.icon} />}
              title={first.title}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="With description">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={first.icon} />}
              title={first.title}
              description={first.description}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="With status dot">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={sampleApp.icon} />}
              title={sampleApp.title}
              description={sampleApp.description}
              statusDot={<StatusDot status="active" srLabel="Connected" />}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="With trailing">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={second.icon} />}
              title={second.title}
              description="Ask an admin to allow this agent."
              trailing={<Lock className="size-4 text-ink-muted" aria-hidden />}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="With action">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={second.icon} />}
              title={second.title}
              description={second.description}
              action={<CatalogAddButton label={`Install ${second.title}`} />}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Dot, badge and action">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={sampleApp.icon} />}
              title={sampleApp.title}
              description="Connected by @julian"
              statusDot={<StatusDot status="active" srLabel="Connected" />}
              trailing={<Badge variant="secondary">Installed</Badge>}
              action={<CatalogAddButton label="Connect another account" />}
            />
          </Measure>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Hover or tab into a row: the fill sweeps the whole row from either target, so the two buttons still read as one."
      >
        <SpecimenRow label="Hover / focus">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={first.icon} />}
              title={first.title}
              description="Hover me, or tab to the plus: one fill, whole row."
              action={<CatalogAddButton label={`Install ${first.title}`} />}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Installing">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={second.icon} />}
              title={second.title}
              description={second.description}
              action={
                <CatalogAddButton label="Installing" busy aria-busy="true" />
              }
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Action disabled">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={second.icon} />}
              title={second.title}
              description="Already installed on this agent."
              action={<CatalogAddButton label="Install" disabled />}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Row disabled">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={first.icon} />}
              title={first.title}
              description={first.description}
              disabled
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Status instead of a blurb">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={sampleApp.icon} />}
              title={sampleApp.title}
              description={
                <StatusBadge status="error" label="Needs reconnecting" />
              }
              action={<CatalogAddButton label="Reconnect Gmail" />}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Truncation">
          <Measure>
            <CatalogRow
              icon={<SampleIcon icon={first.icon} />}
              title="Inbox Zero for shared team mailboxes and escalations"
              description="Triages every message that lands in the shared mailbox, drafts the reply, and escalates anything it is unsure about."
            />
          </Measure>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={rowProps} />

      <SpecimenTokens
        classes={[
          "hover:bg-hover",
          "focus-within:bg-hover",
          "text-ink",
          "text-ink-muted",
          "focus-visible:ring-focus/40",
          "hover:bg-input",
          "focus-visible:bg-input",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["CatalogRow", "CatalogAddButton"];

export const specimen: Specimen = {
  id: "core-catalog-row",
  title: "Catalog row",
  group: "Catalog",
  render: () => <CatalogRowSpecimen />,
};

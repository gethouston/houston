import { CatalogShell } from "@houston-ai/core";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  AvailableRows,
  InstalledRows,
  InstalledSkeleton,
  ShellControls,
  ShellViewport,
  shellProps,
} from "./catalog-shell-parts";
import { availableAgents, installedAgents } from "./sample";

function TwoSourceShell() {
  const [tab, setTab] = useState("agents");
  return (
    <ShellViewport>
      <CatalogShell
        controls={<ShellControls />}
        installed={<InstalledRows items={installedAgents} />}
        installedTitle="Your agents"
        installedCount={installedAgents.length}
        availableTitle="Available"
        availableCount={availableAgents.length}
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: "agents",
            label: "Agents",
            count: availableAgents.length,
            content: <AvailableRows items={availableAgents} />,
          },
          {
            value: "skills",
            label: "Skills",
            count: 2,
            content: <AvailableRows items={availableAgents.slice(0, 2)} />,
          },
        ]}
      />
    </ShellViewport>
  );
}

function CatalogShellSpecimen() {
  return (
    <SpecimenPage
      title="Catalog shell"
      intro="The consolidated catalog layout: one sticky controls row over an installed strip and a tabbed discovery area, both filtered by the same query."
    >
      <SpecimenSection
        title="Variants"
        note="The shell has no style variants — it varies by which slots it is given. Scroll a box to watch the controls row fade in its fill."
      >
        <SpecimenRow label="Controls, strip, two tabs">
          <TwoSourceShell />
        </SpecimenRow>
        <SpecimenRow label="One tab — chrome drops">
          <ShellViewport>
            <CatalogShell
              controls={<ShellControls />}
              installed={<InstalledRows items={installedAgents} />}
              installedTitle="Your agents"
              installedCount={installedAgents.length}
              availableTitle="Available"
              availableCount={availableAgents.length}
              tabs={[
                {
                  value: "agents",
                  label: "Agents",
                  content: <AvailableRows items={availableAgents} />,
                },
              ]}
            />
          </ShellViewport>
        </SpecimenRow>
        <SpecimenRow label="No tabs — strip only">
          <ShellViewport>
            <CatalogShell
              installed={<InstalledRows items={installedAgents} />}
              installedTitle="Your agents"
              installedCount={installedAgents.length}
              tabs={[]}
            />
          </ShellViewport>
        </SpecimenRow>
        <SpecimenRow label="Bare tabs — no headings">
          <ShellViewport>
            <CatalogShell
              // Required by the type, unused without an `installed` slot.
              installedTitle="Your agents"
              tabs={[
                {
                  value: "agents",
                  label: "Agents",
                  count: 4,
                  content: <AvailableRows items={availableAgents} />,
                },
                {
                  value: "skills",
                  label: "Skills",
                  count: 2,
                  content: (
                    <AvailableRows items={availableAgents.slice(0, 2)} />
                  ),
                },
              ]}
            />
          </ShellViewport>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="The consumer owns the query; the shell only reflects what it is handed."
      >
        <SpecimenRow label="Loading the strip">
          <ShellViewport>
            <CatalogShell
              controls={<ShellControls />}
              installed={<InstalledSkeleton />}
              installedTitle="Your agents"
              availableTitle="Available"
              availableCount="9000+"
              tabs={[
                {
                  value: "agents",
                  label: "Agents",
                  content: <AvailableRows items={availableAgents} />,
                },
              ]}
            />
          </ShellViewport>
        </SpecimenRow>
        <SpecimenRow label="Filtering — nothing installed matches">
          <ShellViewport>
            <CatalogShell
              controls={<ShellControls />}
              installedTitle="Your agents"
              availableTitle="Available"
              availableCount={1}
              tabs={[
                {
                  value: "agents",
                  label: "Agents",
                  count: 1,
                  content: (
                    <AvailableRows items={availableAgents.slice(0, 1)} />
                  ),
                },
              ]}
            />
          </ShellViewport>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={shellProps} />

      <SpecimenTokens classes={["bg-popover", "bg-card", "border-line"]} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["CatalogShell"];

export const specimen: Specimen = {
  id: "core-catalog-shell",
  title: "Catalog shell",
  group: "Catalog",
  render: () => <CatalogShellSpecimen />,
};
